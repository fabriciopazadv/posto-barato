# Posto Barato — Plataforma (Fase 2)

Plataforma que entrega ao **cliente final** as informações do **Banco de Dados
Posto Barato**: preços de combustíveis, postos próximos, comparação, economia
real e histórico. O cliente acessa **exclusivamente a API oficial** — nunca o
coletor, o Nota MT, evidências ou o banco diretamente.

> Fase 1 (coletor privado + banco): mantida em repositório/branch próprio.
> Esta Fase 2 **lê** o banco através de uma camada pública derivada e o expõe
> por uma API versionada. Ver [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Estado atual (incremento 1)

✅ Entregue e verificável nesta fase:

- **Monorepo** (pnpm + Turborepo + TypeScript strict).
- **`packages/shared-types`** — contratos compartilhados.
- **`packages/database`** — Prisma lendo o schema `collector` (parcial,
  somente-leitura) + schema `app` com **PostGIS** e a matview pública
  **`app.public_latest_prices`** + seed demonstrativo (Rondonópolis/MT).
- **`apps/api`** — API `/api/v1` (Fastify + Swagger + Zod): saúde, config,
  produtos, municípios, postos (proximidade/filtros/ordenação), detalhes,
  preços (latest/summary/compare) e histórico. Projeções públicas, classificação
  de frescor, rate limiting e paginação.
- **Docker Compose** (PostgreSQL+PostGIS, Redis, API), `.env.example` e docs.

⏳ Próximos incrementos (não incluídos aqui): app mobile (Expo), web/PWA
(Next.js), autenticação, favoritos, alertas, veículos, recarga elétrica,
contribuições, planos/assinatura/pagamento, notificações, LGPD e design system
em código. Ver [seção "Roadmap"](#roadmap).

## Pré-requisitos

- Node.js ≥ 22, pnpm ≥ 10, Docker (para PostgreSQL+PostGIS e Redis).

## Como rodar (dev)

```bash
pnpm install
cp .env.example .env

# sobe PostgreSQL+PostGIS e Redis
pnpm docker:up

# aplica o schema (collector bootstrap p/ dev + schema app/PostGIS) e semeia demo
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# inicia a API em http://localhost:3333/api/v1 (Swagger em /docs)
pnpm dev:api
```

Exemplos:

```bash
curl "http://localhost:3333/api/v1/health"
curl "http://localhost:3333/api/v1/stations?municipality=Rondon%C3%B3polis&state=MT&product=ETANOL&sort=lowest_price"
curl "http://localhost:3333/api/v1/stations?latitude=-16.47&longitude=-54.63&radiusKm=5&sort=nearest"
```

## Scripts

| Comando | Ação |
|---|---|
| `pnpm dev:api` | API em modo watch |
| `pnpm build` | Build de todos os pacotes |
| `pnpm typecheck` | Checagem de tipos |
| `pnpm lint` | Lint |
| `pnpm test` | Testes unitários |
| `pnpm db:migrate` | Aplica migrações (SQL: collector bootstrap + app/PostGIS) |
| `pnpm db:seed` | Semeia dados demonstrativos (Rondonópolis/MT) |
| `pnpm db:reset` | Recria os schemas e semeia |
| `pnpm docker:up` / `pnpm docker:down` | Sobe/derruba Postgres+Redis |

## Estrutura

```
apps/api/               API pública de leitura
packages/database/      Prisma + PostGIS + camada pública derivada + seed
packages/shared-types/  Contratos TypeScript compartilhados
docker/                 Dockerfile da API
docs/                   architecture · security · api · product
design-system/          Tokens de marca (DESIGN.md)
screens/ · index.html   Referência visual (export do Google Stitch)
```

A galeria de telas de referência abre em `index.html` (ver histórico do repo).

## Segurança

Nenhum dado interno da coleta é exposto. A fonte pública é sempre
**"Banco de Dados Posto Barato"**; os preços não são declarados oficiais nem em
tempo real. Detalhes em [`docs/security/data-boundaries.md`](docs/security/data-boundaries.md).

## Roadmap

Ordem de implementação da seção 39 da especificação. Incremento 1 cobre os
passos 1–10 (fundação + API de leitura + geo + Swagger). Próximos: clientes
(mobile/web), autenticação, áreas logadas, recarga elétrica, planos/pagamento,
notificações e observabilidade.
