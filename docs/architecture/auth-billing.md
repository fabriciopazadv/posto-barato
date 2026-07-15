# Autenticação e Premium vitalício (Fase 2, incremento 2)

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

## Premium vitalício

**Diferente de uma assinatura recorrente**: é uma **compra única** de
R$ 9,99 que libera o Premium para sempre. Não há trial, ciclo, cancelamento
ou renovação — só `users.premium_since` (não nulo = Premium).

### Provedor: Asaas (mesmo do mei-facil), cobrança avulsa

O mei-facil usa Asaas Checkout hospedado com `chargeTypes: ["RECURRENT"]`
para assinatura mensal/semestral. O Premium vitalício usa
**`chargeTypes: ["DETACHED"]`** — cobrança avulsa, sem débito automático — que
é o que o Asaas exige para pagamentos únicos, e permite tanto Pix quanto
cartão (ao contrário do `RECURRENT`, que no mei-facil aceita só cartão).

Sem `ASAAS_API_KEY` configurada, o checkout roda **simulado**: a compra é
confirmada na hora (sem cobrança real), útil para desenvolvimento e demos.

### Fluxo

1. `POST /api/v1/billing/checkout` (autenticado) cria uma `Purchase` com
   status `PENDING` e abre um Checkout Asaas com
   `externalReference = "userId:purchaseId"`.
2. Ao pagar, o Asaas dispara o webhook `POST /api/v1/billing/webhook`
   (validado por `asaas-access-token`, comparação em tempo constante).
3. `CHECKOUT_PAID` → localiza a compra pelo `externalReference` e marca
   `PAID` + `users.premium_since = now()` (transação única, idempotente).
   `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` → confirmação redundante, localizada
   pelo `checkoutSession`.

### Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/v1/billing/offer` | — | Preço e descrição do Premium |
| POST | `/api/v1/billing/checkout` | access token | Inicia a compra |
| GET | `/api/v1/billing/purchases` | access token | Histórico de compras |
| POST | `/api/v1/billing/webhook` | token do Asaas | Confirmação de pagamento |

Nunca armazenamos número de cartão ou CVV — a tokenização é toda do Asaas
(seção 16).
