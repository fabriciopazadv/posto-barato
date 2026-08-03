# Fronteiras de dados e segurança (Fase 2)

## Nunca exposto ao cliente final

Três barreiras em série, cada uma suficiente sozinha:

1. **As views `collector.*`** não selecionam as colunas privadas — o que não está
   na view não existe para a Fase 2.
2. **A matview `app.public_latest_prices`** não tem essas colunas.
3. **Os grants**: `price_reader` não tem `SELECT` nas tabelas-base de `public.*`.

A API pública **jamais** retorna, e nenhuma das duas camadas **contém**:

- `collection_evidence` e `observation_evidence` (caminhos de screenshot/HTML,
  sha256, cabeçalhos pessoais);
- `collection_errors` e `collection_runs` (screenshot_path, html_snapshot_path,
  host_name, browser_version);
- `raw_payload` / `raw_visible_data` (payload bruto das observações);
- `raw_registry_payload` e o cadastro administrativo do posto (`cnpj`,
  `corporate_name`, `anp_code`, `anp_authorization`, `anp_status`,
  `registry_source`, `last_registry_sync`);
- `data_sources.internal_name` (ex.: `NOTA_MT_MARKET_RESEARCH`) — removido também
  do modelo Prisma, não só da view;
- `observation_fingerprint`, `source_record_hash`, `evidence_path`,
  `validation_method`, `collection_run_id`, `normalized_name`/`normalized_address`;
- observações com status `PENDING` ou `REJECTED`, filtradas na origem;
- qualquer referência ao Nota MT, sessões, cookies ou tokens do coletor.

A fonte apresentada publicamente é sempre **"Banco de Dados Posto Barato"**
(`data_sources.public_name`), nunca a fonte interna.

`apps/api/test/integration/projection.test.ts` verifica cada item desta lista
contra o catálogo do banco, e `roles.test.ts` verifica os grants.

## Avisos obrigatórios (seção 2)

A API acompanha os preços de metadados de frescor e devolve avisos:

- "Os preços podem sofrer alterações. Confirme as condições no estabelecimento
  antes de abastecer."
- "As informações provêm do Banco de Dados Posto Barato e não são atualizadas em
  tempo real."
- Preço nunca é declarado "oficial" nem "em tempo real". O frescor é classificado
  em RECENT / MODERATE / OLD / EXPIRED (limites configuráveis por env).

## Usuários de banco (produção)

A infra local usa um único usuário por simplicidade. **Em produção**, cinco
papéis distintos, provisionados por
`packages/database/prisma/sql/operations/roles.sql` (senhas do cofre, nunca
versionadas) e privilegiados por `grants.sql`.

| Papel | Enxerga | Escreve | Nunca alcança |
|---|---|---|---|
| `migration_admin` | o que migra | DDL de `app`, views de `collector` | — não é papel de runtime |
| `collector_writer` | tabelas do coletor | tabelas do coletor | schema `app` |
| `price_reader` | `app.public_latest_prices`, `collector.*`, `app.demo_stations` | **nada** | `public.*`, evidências, erros, `app.users` |
| `app_writer` | `app.users`, `refresh_tokens`, `subscriptions`, `billing_events` | as mesmas quatro | `collector.*`, `public.*`, a projeção de preços |
| `price_refresher` | `app.price_refresh_log` | o próprio log | a projeção e o coletor — só `EXECUTE` na função |

Nenhum papel de runtime recebe `SUPERUSER`, `CREATEDB`, `CREATEROLE` ou
`BYPASSRLS`; todos são `NOINHERIT`. Nenhum recebe privilégio amplo sobre o schema
`public` — o acesso aos preços passa pelas views, cujo dono é quem tem `SELECT`
nas tabelas-base.

Em produção a API recebe `DATABASE_READONLY_URL` (`price_reader`) e
`DATABASE_APP_URL` (`app_writer`), e **não** recebe credencial de migração:
um processo que atende a internet não tem por que poder alterar schema. Faltando
qualquer uma das duas, a API não sobe.

`app.purchases` não aparece mais nesta lista porque a tabela deixou de existir —
o modelo de compra vitalícia foi substituído por assinatura recorrente em
`0002_auth_billing.sql`.

Procedimento completo em
[`docs/operations/database-integration.md`](../operations/database-integration.md).

## Segredos de autenticação e pagamento

`AUTH_ACCESS_SECRET` assina os access tokens (JWT); comprometê-lo permite
forjar sessões — trate como credencial de produção, nunca versionado.
`ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` seguem a mesma regra. Senhas são
hasheadas com Argon2id e refresh tokens são armazenados só como hash SHA-256
— nenhum dos dois é reversível a partir do banco. Nenhum desses valores é
logado (ver redação de `authorization`/`cookie` em `app.ts`).

## Dado pessoal do pagador (CPF/CNPJ)

`subscriptions.cpf_cnpj_pagador` guarda o documento informado quando a pessoa
escolhe o plano. Existe por uma razão só: o Asaas exige documento para criar o
cliente, e sem ele guardado a virada do teste não vira cobrança sozinha.

Limites que acompanham esse dado:

- **Sai do banco em uma direção só** — o Asaas, ao criar o cliente. Para tela,
  log e suporte sai apenas mascarado (`***.982.247-**`, via
  `mascararDocumento`); a API nunca devolve o número inteiro.
- **Cancelar durante o teste apaga o documento** junto com a intenção de
  assinatura: sem cobrança à vista, não há por que continuar guardando.
- **Nunca é chave de busca nem identificador** — a conta é identificada por
  `user_id`; o documento não tem índice e não aparece em nenhum filtro.

Cartão e CVV seguem fora do escopo: a tokenização é toda do Asaas (seção 16).

## Proteções da API

- **Rate limiting** por IP (`@fastify/rate-limit`), configurável.
- **Helmet** para cabeçalhos de segurança.
- **Validação Zod** em todos os parâmetros de entrada; limites de paginação e raio.
- **Tratamento central de erros**: nunca vaza stack trace; responde com código
  estável + `requestId`; loga o erro completo apenas no servidor.
- **Logs** com redação de `authorization`/`cookie`; nunca registram segredos.

## Itens ainda pendentes (próximos incrementos)

LGPD (consentimento/exportação/exclusão de conta) e auditoria de ações
entram junto com as áreas logadas (favoritos, alertas, veículos).
