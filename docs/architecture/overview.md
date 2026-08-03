# Arquitetura — Plataforma Posto Barato (Fase 2)

## Separação obrigatória

```
FONTES E COLETOR PRIVADO   (Fase 1 — repositório/branch do coletor)
        │  escreve
        ▼
public.*                   tabelas do coletor, no banco operacional
        │  views de compatibilidade somente-leitura (privilégios do dono da view)
        ▼
collector.*                contrato estável e limitado para a Fase 2
        │  DISTINCT ON pela data de negócio, só colunas públicas
        ▼
app.public_latest_prices   projeção pública (matview + PostGIS)
        │  price_reader — conexão sem nenhum privilégio de escrita
        ▼
API PRIVADA DO POSTO BARATO   (apps/api — Fastify)
        │  HTTP /api/v1 (somente dados públicos)
        ▼
APLICATIVO MOBILE E WEB
        │
        ▼
CLIENTE FINAL
```

O cliente final acessa **exclusivamente** a API `/api/v1`. O frontend nunca
conecta ao PostgreSQL, nunca acessa o coletor, o Nota MT, evidências ou sessões.

Detalhes operacionais — variáveis de ambiente, papéis, comandos do administrador,
refresh e troca de imagem do Postgres — em
[`docs/operations/database-integration.md`](../operations/database-integration.md).

## Monorepo

```
apps/
  api/                 API pública de leitura (Fastify + Swagger + Zod)
packages/
  database/            Prisma + migrador + refresh + diagnóstico
    prisma/sql/
      migrations/      DDL versionado, aplicado uma vez cada (0001…0005)
      operations/      papéis, grants e índices — executados pelo administrador
      dev/             fixture do coletor para desenvolvimento e teste
  shared-types/        Contratos TypeScript compartilhados (API ↔ clientes)
docker/                Dockerfile da API
docs/                  architecture · security · operations · api · product
design-system/         Tokens de marca (DESIGN.md) — insumo para o design system
```

Incrementos futuros: `apps/mobile` (Expo), `apps/web` (Next.js/PWA),
`packages/{auth,payments,notifications,maps,design-system,...}`.

## As views de compatibilidade (primeira fronteira)

O coletor está operacional e suas tabelas vivem em `public.*` — não em
`collector.*`, como o bootstrap antigo desta fase supunha. A Fase 2 não move,
renomeia nem altera essas tabelas: cria sobre elas um schema `collector` de
**views somente-leitura** (migração `0003`).

São views comuns, e não `security_invoker`, de propósito: view comum executa com
os privilégios de quem a criou, então conceder `SELECT` na view **não** exige
conceder `SELECT` nas tabelas-base. É esse detalhe que permite a `price_reader`
ler preços e receber "permissão negada" em `public.collection_evidence`.

Nunca atravessam as views: `raw_payload`, `raw_registry_payload`,
`evidence_path`, `observation_fingerprint`, `source_record_hash`,
`internal_name`, `validation_method`, `collection_run_id`, o cadastro
administrativo do posto (`cnpj`, `corporate_name`, `anp_*`, `registry_*`) e as
tabelas `collection_evidence`, `observation_evidence`, `collection_errors` e
`collection_runs`. `PENDING` e `REJECTED` também não: são filtradas na origem.

## A camada pública derivada (segunda fronteira)

A Fase 1 **não tem PostGIS**. A Fase 2 cria no schema `app` a materialized view
**`app.public_latest_prices`**, que:

- contém **apenas** colunas públicas (nome, endereço, bairro, município, UF,
  lat/long, produto, preço, unidade, datas, confiança, fonte pública, `is_demo`);
- deriva uma coluna PostGIS `geography(Point,4326)` a partir de lat/long, com
  índice **GIST** para consultas por proximidade (`ST_DWithin` / `ST_Distance`);
- expõe somente a **observação publicável mais recente** de cada par
  posto+produto (`DISTINCT ON`), escolhida pela **data de negócio**
  `COALESCE(observed_at, estimated_observed_at, collected_at)` — `collected_at` e
  `created_at` só desempatam. Ordenar pela coleta faria uma recoleta de preço
  antigo passar na frente de uma observação genuinamente mais nova.

Como as colunas sensíveis **não existem** na matview, a API não tem como
vazá-las — a segurança não depende do código de projeção, mas do formato físico
da view.

### Observações expiradas

`PENDING` e `REJECTED` nunca são publicadas. **`EXPIRED` é publicada, com
marca**: esconder faz o posto sumir do mapa, e posto ausente é lido pelo usuário
como "não existe", não como "não sabemos o preço de hoje". As colunas
`price_status` e `expires_at` viajam na projeção e a API deriva o vencimento no
instante da consulta — `now()` congelado no refresh diria que um preço vencido
ainda vale. Quando a fonte diz que expirou, `EXPIRED` prevalece sobre as faixas
de frescor do relógio.

### Refresh

`app.refresh_public_prices()` é `SECURITY DEFINER` com `search_path` fixo e todo
objeto qualificado por schema, o que permite conceder `EXECUTE` a
`price_refresher` sem lhe dar privilégio sobre tabela nenhuma. Usa
`REFRESH ... CONCURRENTLY` (que não bloqueia leitura) e advisory lock para
descartar refreshes concorrentes. Não captura `WHEN OTHERS`: a primeira carga é
detectada por `pg_class.relispopulated`, e erro de permissão ou de SQL sobe em
vez de virar sucesso aparente.

## Conexões separadas por privilégio

A API abre **duas** conexões, com credenciais diferentes:

| Cliente | Papel | Usado por |
|---|---|---|
| `readonlyDb()` | `price_reader` | preços, catálogo, municípios, histórico |
| `appDb()` | `app_writer` | contas, sessões, assinatura, cobrança |

Prisma gera um cliente por schema, não um por conexão: a separação sai de
instanciar o mesmo cliente gerado com `datasourceUrl` diferente, o que dá pools
e credenciais independentes. O que ele **não** dá é verificação em tempo de
compilação de que um serviço usou o cliente certo — quem garante isso é o grant:
`price_reader` não tem `INSERT` em lugar nenhum, então um import errado vira erro
na hora, não vazamento. `apps/api/test/integration/roles.test.ts` verifica isso
contra o banco.

## Fluxo de uma consulta por proximidade

1. Cliente chama `GET /api/v1/stations?latitude=..&longitude=..&radiusKm=..&product=..&sort=nearest`.
2. A API valida os parâmetros (Zod), aplica limites (paginação/raio) e monta SQL
   parametrizado contra `app.public_latest_prices`, pela conexão de leitura.
3. O PostGIS filtra e ordena por distância usando o índice GIST (nunca há
   cálculo linha a linha no app).
4. A camada de projeção classifica o frescor de cada preço
   (RECENT/MODERATE/OLD/EXPIRED) e monta a resposta pública.

## Decisões técnicas desta fase

- **Fastify** (permitido na seção 4) para uma API enxuta e verificável.
- **Prisma** com modelos do `collector` apontando para as **views**, e não para
  as tabelas — reforço extra à fronteira, já que view não aceita escrita.
- Migrações do `app` em **SQL puro** (PostGIS/matview/funções não são bem
  expressos pelo Prisma Migrate), aplicadas por um migrador com registro,
  checksum, transação por arquivo e advisory lock. A Fase 2 nunca altera as
  tabelas do coletor — nem para acrescentar índice: a proposta de índices fica
  em `sql/operations/collector_indexes.sql`, para execução de quem as administra.
