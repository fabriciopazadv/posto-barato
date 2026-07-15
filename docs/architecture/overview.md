# Arquitetura — Plataforma Posto Barato (Fase 2)

## Separação obrigatória

```
FONTES E COLETOR PRIVADO   (Fase 1 — repositório/branch do coletor)
        │  escreve
        ▼
BANCO DE DADOS POSTO BARATO   (PostgreSQL, schema `collector`)
        │  leitura restrita (api_reader) via camada pública derivada
        ▼
API PRIVADA DO POSTO BARATO   (apps/api — Fastify, schema `app` + PostGIS)
        │  HTTP /api/v1 (somente dados públicos)
        ▼
APLICATIVO MOBILE E WEB   (próximos incrementos)
        │
        ▼
CLIENTE FINAL
```

O cliente final acessa **exclusivamente** a API `/api/v1`. O frontend nunca
conecta ao PostgreSQL, nunca acessa o coletor, o Nota MT, evidências ou sessões.

## Monorepo

```
apps/
  api/                 API pública de leitura (Fastify + Swagger + Zod)
packages/
  database/            Prisma (leitura do `collector`) + schema `app` + PostGIS + seed
  shared-types/        Contratos TypeScript compartilhados (API ↔ clientes)
prisma → packages/database/prisma
docker/                Dockerfile da API
docs/                  Arquitetura, segurança, API, produto
design-system/         Tokens de marca (DESIGN.md) — insumo para o design system
screens/               Referência visual (export do Stitch)
```

Incrementos futuros: `apps/mobile` (Expo), `apps/web` (Next.js/PWA),
`packages/{auth,payments,notifications,maps,design-system,...}`.

## A camada pública derivada (fronteira física)

A Fase 1 **não tem PostGIS** e mistura, na mesma tabela, campos públicos e
internos (`raw_visible_data`, `evidence_id`, fingerprints…). Em vez de expor
essas tabelas, a Fase 2 cria no schema `app` a materialized view
**`app.public_latest_prices`**, que:

- contém **apenas** colunas públicas (nome, endereço, bairro, município, UF,
  lat/long, produto, preço, unidade, datas, confiança, `is_demo`);
- deriva uma coluna PostGIS `geography(Point,4326)` a partir de lat/long, com
  índice **GIST** para consultas por proximidade (`ST_DWithin` / `ST_Distance`);
- expõe somente a **observação válida mais recente** de cada par posto+produto
  (`DISTINCT ON`), preservando o histórico completo no `collector`.

Como as colunas sensíveis **não existem** na matview, a API não tem como
vazá-las — a segurança não depende só do código de projeção, mas do próprio
formato físico da view. O refresh é feito por `app.refresh_public_prices()`
após cada coleta relevante.

## Fluxo de uma consulta por proximidade

1. Cliente chama `GET /api/v1/stations?latitude=..&longitude=..&radiusKm=..&product=..&sort=nearest`.
2. A API valida os parâmetros (Zod), aplica limites (paginação/raio) e monta SQL
   parametrizado contra `app.public_latest_prices`.
3. O PostGIS filtra e ordena por distância usando o índice GIST (nunca há
   cálculo linha a linha no app).
4. A camada de projeção classifica o frescor de cada preço
   (RECENT/MODERATE/OLD/EXPIRED) e monta a resposta pública.

## Decisões técnicas desta fase

- **Fastify** (permitido na seção 4) para uma API enxuta e verificável.
- **Prisma** com modelos do `collector` declarados de forma **parcial e
  somente-leitura** — reforço extra à fronteira da matview.
- Migrações do `app` em **SQL puro** (PostGIS/matview/funções não são bem
  expressos pelo Prisma Migrate). A Fase 2 nunca altera o schema `collector`.
