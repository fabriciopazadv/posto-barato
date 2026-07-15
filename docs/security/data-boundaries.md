# Fronteiras de dados e segurança (Fase 2)

## Nunca exposto ao cliente final

A API pública **jamais** retorna, e a matview `app.public_latest_prices` **não
contém**:

- `collection_evidence` (caminhos de screenshot/HTML, sha256, cabeçalhos pessoais);
- `collection_errors` e detalhes internos de `collection_runs`
  (screenshot_path, html_snapshot_path, host_name, browser_version);
- `raw_visible_data` (payload bruto das observações);
- `data_sources.internal_name` (ex.: `NOTA_MT_MARKET_RESEARCH`);
- fingerprints, `evidence_id`, ids de execução da coleta;
- qualquer referência ao Nota MT, sessões, cookies ou tokens do coletor.

A fonte apresentada publicamente é sempre **"Banco de Dados Posto Barato"**
(`data_sources.public_name`), nunca a fonte interna.

## Avisos obrigatórios (seção 2)

A API acompanha os preços de metadados de frescor e devolve avisos:

- "Os preços podem sofrer alterações. Confirme as condições no estabelecimento
  antes de abastecer."
- "As informações provêm do Banco de Dados Posto Barato e não são atualizadas em
  tempo real."
- Preço nunca é declarado "oficial" nem "em tempo real". O frescor é classificado
  em RECENT / MODERATE / OLD / EXPIRED (limites configuráveis por env).

## Usuários de banco (produção)

A infra local usa um único usuário por simplicidade. **Em produção**, crie
papéis distintos (seção 7):

```sql
-- Papel da API (leitura pública + escrita das próprias tabelas de conta).
-- Sem acesso a evidências/erros do coletor em nenhuma hipótese.
CREATE ROLE app_api LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA app TO app_api;
GRANT SELECT ON app.public_latest_prices TO app_api;
GRANT SELECT ON collector.products TO app_api;              -- catálogo
GRANT SELECT (id, station_id, product_id, price_decimal, collected_at)
  ON collector.price_observations TO app_api;               -- histórico agregado
-- Tabelas de conta/sessão/compra (Fase 2, incremento 2) — a API é a única
-- escritora dessas tabelas, nunca o coletor.
GRANT SELECT, INSERT, UPDATE ON app.users, app.refresh_tokens, app.purchases TO app_api;
-- NÃO conceder SELECT em collection_evidence, collection_errors,
-- nem nas colunas raw_visible_data / *_path.

-- Apenas migrações.
CREATE ROLE migration_admin LOGIN PASSWORD '***';

-- Escrita da coleta (Fase 1).
CREATE ROLE collector_writer LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA collector TO collector_writer;
```

Configure `DATABASE_URL` da API com `app_api` em produção.
`SKIP_COLLECTOR_BOOTSTRAP=true` em produção (a Fase 1 é dona do schema `collector`).

## Segredos de autenticação e pagamento

`AUTH_ACCESS_SECRET` assina os access tokens (JWT); comprometê-lo permite
forjar sessões — trate como credencial de produção, nunca versionado.
`ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` seguem a mesma regra. Senhas são
hasheadas com Argon2id e refresh tokens são armazenados só como hash SHA-256
— nenhum dos dois é reversível a partir do banco. Nenhum desses valores é
logado (ver redação de `authorization`/`cookie` em `app.ts`).

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
