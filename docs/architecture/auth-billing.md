# Autenticação e assinatura do Premium (Fase 2)

## Autenticação

Padrão inspirado no mei-facil (outro SaaS do mesmo produto), adaptado para
servir **web e mobile** a partir da mesma API:

- **Senha**: Argon2id (seção 14 da especificação) — nunca logada.
- **Access token**: JWT (HS256, `jose`), curta duração (padrão 15 min),
  stateless, enviado sempre via `Authorization: Bearer <token>`.
- **Refresh token**: opaco, alta entropia (256 bits), **rotativo** — cada uso
  gera um novo e revoga o anterior. O servidor armazena apenas o hash
  (SHA-256); o valor cru nunca é persistido.
  - **Web**: entregue como cookie `HttpOnly`, `Secure`, `SameSite=Lax`,
    restrito ao path `/api/v1/auth` — nunca aparece no JSON de resposta (evita
    exposição via XSS).
  - **Mobile**: sem cookie jar de navegador; o token vem no corpo da resposta
    para o app armazenar em SecureStore/Keychain. O cliente sinaliza isso com
    `clientType: "mobile"` no corpo de `/auth/login`, `/auth/register` e
    `/auth/refresh`.
- **Detecção de reuso**: se um refresh token já revogado for apresentado
  novamente (sinal de roubo), todas as sessões daquele usuário são revogadas
  por precaução.
- **Rate limit** dedicado (10 tentativas / 10 min) em `/auth/login` e
  `/auth/register`, além do limite global da API.

### Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Cria conta |
| POST | `/api/v1/auth/login` | — | Login |
| POST | `/api/v1/auth/refresh` | refresh token | Rotaciona a sessão |
| POST | `/api/v1/auth/logout` | refresh token | Revoga a sessão atual |
| GET | `/api/v1/auth/me` | access token | Dados da conta |

## Assinatura do Premium

Espelha o sistema de cobrança do **mei-facil** (outro produto do mesmo autor),
com um plano anual a mais. Substituiu o modelo anterior de compra única
vitalícia, que foi removido antes de existir qualquer cliente.

### Planos

| Plano | Ciclo | Preço | Equivalente mensal |
|---|---|---|---|
| Anual | 12 meses | R$ 89,99 | R$ 7,50 |
| Semestral | 6 meses | R$ 49,99 | R$ 8,33 |
| Mensal | 1 mês | R$ 9,99 | R$ 9,99 |

Os preços vivem em `@posto-barato/domain` (`PRECOS_PADRAO`) e podem ser
sobrescritos sem deploy por `ASAAS_VALUE_MENSAL`, `ASAAS_VALUE_SEMESTRAL` e
`ASAAS_VALUE_ANUAL` (em reais). O valor vigente é gravado em
`subscriptions.valor_centavos` no ato da escolha, então mudar a tabela **não
altera contratos já firmados**. A tela recebe os planos por
`GET /billing/planos` em vez de repetir números — o que ela anuncia é o que
será cobrado.

### Teste grátis: 7 dias

Contados do cadastro. Cobrem 2–4 abastecimentos do motorista médio, que é
quando a economia fica visível. São bem menos que os 31 dias do mei-facil de
propósito: lá a obrigação do MEI é mensal, aqui o ciclo de uso é semanal.

### As três invariantes

1. **Nenhuma cobrança nasce antes de os dias gratuitos serem usados.**
   `garantirCobrancaPermitida` é a trava, aplicada imediatamente antes de
   qualquer criação de cobrança no provedor — não importa quem chame.
2. **O teste é concedido uma única vez**, no cadastro. `trial_started_at` e
   `trial_ends_at` nunca são reescritos depois.
3. **Sinal externo nunca rebaixa uma assinatura** nem a devolve ao teste. O
   Asaas reentrega eventos em caso de falha; sem `transicaoExternaPermitida`,
   uma reentrega marcava assinante em dia como TRIAL com data no passado, e o
   gate passava a bloqueá-lo.

### Estados

| Status | Significado | Acesso |
|---|---|---|
| `TRIAL` | dias grátis correndo; nada criado no provedor | liberado até `trial_ends_at` |
| `TRIAL_EXPIRADO` | dias usados, sem plano escolhido | bloqueado |
| `AGUARDANDO_PAGAMENTO` | 1ª cobrança emitida | liberado até 48h após o vencimento |
| `ATIVA` | em dia | liberado |
| `INADIMPLENTE` | cobrança vencida | liberado por 48h a partir do aviso |
| `CANCELADA` | encerrada | liberado até `acesso_ate` (período já pago) |

A carência de 48h existe porque Pix e boleto levam dias úteis para compensar —
derrubar quem já pagou seria pior que esperar. Ela é limitada no tempo de
propósito: se o aviso de vencimento nunca chegar, o acesso fecha sozinho em vez
de ficar aberto para sempre.

### Os dois momentos do ciclo

O desenho separa deliberadamente escolher de cobrar:

1. **Durante o teste** — a pessoa escolhe o plano e o app grava só isso
   (`plano_escolhido` + preço travado). **Nada é criado no Asaas**: nenhum
   cliente, nenhuma assinatura, nenhuma cobrança. É o que sustenta a invariante 1.
2. **Na virada do teste** — o cron cria o cliente e a assinatura recorrente no
   Asaas com vencimento hoje, e o status passa a `AGUARDANDO_PAGAMENTO`.

Quem assina **depois** do teste pula direto para o passo 2.

A assinatura no Asaas usa `billingType: UNDEFINED` (forma de pagamento aberta):
a cada ciclo o cliente escolhe Pix, cartão ou boleto. `externalReference` viaja
como `"userId:plano"` até os webhooks.

Sem `ASAAS_API_KEY` fora de produção, o fluxo roda **simulado** (a cobrança é
dada como paga). Em produção a ausência da chave é **erro**, nunca degradação
silenciosa — um deploy sem chave liberaria o Premium de graça para todo mundo.

### Webhook

`POST /api/v1/billing/webhook`, validado pelo header `asaas-access-token`
(comparação em tempo constante). Sem token, qualquer um poderia forjar
`PAYMENT_CONFIRMED` (assinatura de graça) ou `SUBSCRIPTION_DELETED` (derrubar o
acesso de um cliente); em produção a validação é obrigatória.

**Idempotência**: o id do evento é gravado em `app.billing_events` *antes* de
qualquer efeito. A segunda entrega do mesmo evento encontra a chave ocupada e
retorna sem reprocessar.

| Evento | Efeito |
|---|---|
| `SUBSCRIPTION_CREATED` | grava os ids reais (`sub_…` / `cus_…`) |
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | → `ATIVA`, agenda o próximo ciclo |
| `PAYMENT_OVERDUE` | → `INADIMPLENTE`, abre a carência |
| `SUBSCRIPTION_DELETED` / `_INACTIVATED` | → `CANCELADA`, preserva o período pago |

### Cron: virada e reconciliação

`POST /api/v1/billing/cron`, com `Authorization: Bearer $CRON_SECRET`. No
mei-facil isso é Vercel Cron; aqui a API é um processo Fastify e o gatilho vem
do agendador da plataforma que a hospedar (uma vez por dia).

Faz duas coisas:

- **Virada** — de quem já usou os dias grátis: com plano escolhido, cria a
  cobrança; sem plano, marca `TRIAL_EXPIRADO`. Idempotente, porque a transição
  tira o usuário do conjunto varrido. Uma falha individual não derruba os demais.
- **Reconciliação** — rede de segurança para webhooks perdidos. Sem ela, todo o
  estado dependeria de o evento chegar: um webhook entregue enquanto a env
  estava ausente deixaria cliente pagante bloqueado, e uma assinatura excluída
  direto no painel do Asaas manteria o acesso liberado para sempre. O app
  **pergunta** à API do Asaas, em lotes de 200, e aplica o resultado pelos
  mesmos guardas de transição do webhook.

### Cancelamento

`DELETE /api/v1/billing/subscription`. Cancelar precisa ser tão fácil quanto
contratar (CDC art. 49 e Decreto 7.962/2013).

O acesso **não** é cortado na hora: quem pagou o ciclo usa o ciclo até o fim
(`acesso_ate`). Quem cancela durante o teste segue com os dias grátis restantes
— e sem cobrança nenhuma, porque ela nunca chegou a ser criada. A chamada ao
Asaas acontece **antes** de gravar o status local: pior que não cancelar é
dizer que cancelou e seguir cobrando.

### Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/billing/planos` | — | Planos, dias de teste e carência |
| GET | `/api/v1/billing/subscription` | access token | Estado da assinatura |
| POST | `/api/v1/billing/subscription` | access token | Escolhe o plano ou cria a cobrança |
| DELETE | `/api/v1/billing/subscription` | access token | Cancela |
| GET | `/api/v1/billing/subscription/debug` | access token | Marcos de tempo (suporte) |
| POST | `/api/v1/billing/webhook` | token do Asaas | Sinal do provedor |
| POST | `/api/v1/billing/cron` | `CRON_SECRET` | Virada + reconciliação |

Uma rota bloqueada pelo gate responde **402** com código
`SUBSCRIPTION_REQUIRED` — o cliente usa isso para levar à tela de planos.

Nunca armazenamos número de cartão ou CVV: a tokenização é toda do Asaas
(seção 16).

### Onde está o quê

| Arquivo | Responsabilidade |
|---|---|
| `packages/domain/src/billing-policy.ts` | ciclo, trial, carência, transições — puro |
| `packages/domain/src/subscription-policy.ts` | o gate de acesso — puro |
| `packages/domain/src/planos.ts` | preços e rótulos — fonte única |
| `apps/api/src/services/payment/asaas-billing-provider.ts` | integração com o Asaas |
| `apps/api/src/services/billing.service.ts` | orquestração (banco + provedor) |
| `apps/api/src/services/billing-cron.service.ts` | virada e reconciliação |
| `apps/api/src/domain/asaas-webhook.ts` | parsing dos eventos — puro |
| `apps/api/src/services/subscription-gate.ts` | `requireAssinaturaAtiva` |

As regras são puras e testadas isoladamente: 38 casos em
`billing-policy.test.ts`, `subscription-gate.test.ts` e `planos.test.ts`.
