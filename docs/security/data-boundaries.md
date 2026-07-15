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
-- Leitura da camada pública (usado pela API). Sem acesso a evidências/erros.
CREATE ROLE api_reader LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA app TO api_reader;
GRANT SELECT ON app.public_latest_prices TO api_reader;
GRANT SELECT ON collector.products TO api_reader;          -- catálogo
GRANT SELECT (id, station_id, product_id, price_decimal, collected_at)
  ON collector.price_observations TO api_reader;           -- histórico agregado
-- NÃO conceder SELECT em collection_evidence, collection_errors,
-- nem nas colunas raw_visible_data / *_path.

-- Escrita de dados de usuário (favoritos, alertas, veículos) — próximo incremento.
CREATE ROLE app_writer LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA app TO app_writer;

-- Apenas migrações.
CREATE ROLE migration_admin LOGIN PASSWORD '***';

-- Escrita da coleta (Fase 1).
CREATE ROLE collector_writer LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA collector TO collector_writer;
```

Configure `DATABASE_READONLY_URL` com `api_reader` e aponte a API para ele.
`SKIP_COLLECTOR_BOOTSTRAP=true` em produção (a Fase 1 é dona do schema `collector`).

## Proteções da API

- **Rate limiting** por IP (`@fastify/rate-limit`), configurável.
- **Helmet** para cabeçalhos de segurança.
- **Validação Zod** em todos os parâmetros de entrada; limites de paginação e raio.
- **Tratamento central de erros**: nunca vaza stack trace; responde com código
  estável + `requestId`; loga o erro completo apenas no servidor.
- **Logs** com redação de `authorization`/`cookie`; nunca registram segredos.

## Itens ainda pendentes (próximos incrementos)

Autenticação, LGPD (consentimento/exportação/exclusão), auditoria de ações e
CSRF/refresh-token entram junto com as áreas logadas (favoritos, alertas,
veículos, assinatura).
