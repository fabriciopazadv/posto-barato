# Posto Barato — Plataforma (Fase 2)

Plataforma que entrega ao **cliente final** as informações do **Banco de Dados
Posto Barato**: preços de combustíveis, postos próximos, comparação, economia
real e histórico. O cliente acessa **exclusivamente a API oficial** — nunca o
coletor, o Nota MT, evidências ou o banco diretamente.

> Fase 1 (coletor privado + banco): mantida em repositório/branch próprio.
> Esta Fase 2 **lê** o banco através de uma camada pública derivada e o expõe
> por uma API versionada. Ver [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Estado atual (incrementos 1 e 2)

✅ Entregue e verificável nesta fase:

- **Monorepo** (pnpm + Turborepo + TypeScript strict).
- **`packages/shared-types`** — contratos compartilhados.
- **`packages/database`** — Prisma lendo o schema `collector` (parcial,
  somente-leitura) + schema `app` com **PostGIS** e a matview pública
  **`app.public_latest_prices`** + seed demonstrativo (Rondonópolis/MT) +
  tabelas de conta/sessão/compra (`users`, `refresh_tokens`, `purchases`).
- **`apps/api`** — API `/api/v1` (Fastify + Swagger + Zod): saúde, config,
  produtos, municípios, postos (proximidade/filtros/ordenação), detalhes,
  preços (latest/summary/compare) e histórico. Projeções públicas, classificação
  de frescor, rate limiting e paginação.
- **Autenticação** (Argon2 + JWT + refresh token rotativo, cookie HttpOnly no
  web / corpo no mobile) e **assinatura do Premium**: 7 dias grátis seguidos de
  ciclo mensal (R$ 9,99), semestral (R$ 49,99) ou anual (R$ 89,99) via Asaas,
  com webhook idempotente, carência de 48h e reconciliação diária. Espelha o
  sistema de cobrança do mei-facil. Ver
  [`docs/architecture/auth-billing.md`](docs/architecture/auth-billing.md).
- **Docker Compose** (PostgreSQL+PostGIS, Redis, API), `.env.example` e docs.

- **`packages/design-system`** — tokens do `DESIGN.md` como preset Tailwind e
  tema CSS (claro/escuro), reaproveitáveis pelo futuro `apps/mobile`.
- **`packages/domain`** — regras puras (frescor, geo, economia) compartilhadas
  entre a API e os clientes.
- **`apps/web`** — PWA em Next.js: início, mapa de postos, detalhes com
  histórico, comparador de economia real, favoritos, recarga elétrica, perfil,
  Premium e onboarding. Instalável, com modo escuro e tela offline.

⏳ Próximos incrementos (não incluídos aqui): app mobile (Expo), alertas de
preço, contribuições da comunidade, notificações e LGPD.
Ver [seção "Roadmap"](#roadmap).

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
| `pnpm --filter @posto-barato/web dev` | App em modo watch (porta 3000) |
| `pnpm css:build` | Compila o CSS da galeria de protótipos |
| `pnpm site:serve` | Serve `public/` (protótipos) localmente |

## Estrutura

```
apps/
  api/                  API pública de leitura (Fastify + Swagger + Zod)
  web/                  PWA em Next.js — o aplicativo em si
packages/
  database/             Prisma + PostGIS + camada pública derivada + seed
  domain/               Regras puras: frescor, geo, economia e ciclo de cobrança
  design-system/        Tokens do DESIGN.md como preset Tailwind + tema CSS
  shared-types/         Contratos TypeScript compartilhados (API ↔ clientes)
docker/                 Dockerfile da API
docs/                   architecture · security · api · product
design-system/          DESIGN.md — fonte de verdade dos tokens
brand/                  Arte-mestra da marca (logo original)
public/                 Galeria de protótipos do Stitch (publicada em /prototipos)
tools/                  Build de ícones, telas do Stitch e cópia dos protótipos
netlify.toml            publish = apps/web/out, headers, redirects
```

`packages/domain` existe para que o app e a API não divirjam no cálculo de
economia, que é o núcleo do produto: as duas pontas importam a mesma função.

## Aplicativo (apps/web)

PWA em Next.js (App Router) com **export estático**: o app só conversa com a
API pública `/api/v1` e não tem lado servidor, então não há função serverless
nem runtime do Next no deploy — é CDN puro.

```bash
pnpm --filter @posto-barato/web dev     # http://localhost:3000
pnpm --filter @posto-barato/web build   # gera apps/web/out
```

### Origem dos dados

O app lê `NEXT_PUBLIC_API_URL`:

| Variável | Comportamento |
|---|---|
| definida | consome a API real em `/api/v1` |
| ausente | **modo demonstração** — camada local reproduzindo o seed de Rondonópolis/MT |

O modo demonstração aplica as mesmas regras de `@posto-barato/domain` que a
API usa, então trocar de um para o outro não muda números na tela, só a origem
deles. Nenhuma tela chama `fetch` direto: tudo passa por `src/lib/data.ts`.

Áreas que dependem de backend autenticado (login, compra do Premium) ficam
explicitamente desabilitadas enquanto a API não estiver publicada — um login
que parece funcionar mas não autentica seria pior do que nenhum.

### Telas

`/` início · `/mapa` postos · `/posto?id=` detalhes e histórico ·
`/comparador` economia real · `/favoritos` · `/recarga` pontos de recarga ·
`/perfil` veículos e tema · `/premium` · `/economia` · `/entrar` ·
`/onboarding` · `/offline`

### Design system

`packages/design-system` converte o front matter de `design-system/DESIGN.md`
em preset Tailwind + `theme.css`. As cores são custom properties, então o tema
claro/escuro troca por CSS, sem duplicar classes com `dark:`.

```bash
pnpm --filter @posto-barato/design-system sync   # tokens.json → theme.css + tokens.generated.ts
```

## Galeria de protótipos

O export original do Google Stitch continua versionado em `public/` e é
publicado em **`/prototipos`**. Ele não faz nenhuma chamada a terceiros:
Tailwind compilado localmente, fontes auto-hospedadas e ilustrações próprias.

```bash
pnpm css:build                          # CSS dos protótipos
node tools/build-screens.mjs            # normaliza as telas (idempotente)
node tools/build-screens.mjs --check    # falha se algo estiver fora do padrão
node tools/build-icons.mjs              # subset da fonte de ícones (app + telas)
```

`tools/build-icons.mjs` resolve as ligaduras do Material Symbols para
codepoints e subseta a fonte variável de ~4 MB para ~16 KB, preservando os
eixos `FILL` e `wght`.

## Segurança

Nenhum dado interno da coleta é exposto. A fonte pública é sempre
**"Banco de Dados Posto Barato"**; os preços não são declarados oficiais nem em
tempo real. Detalhes em [`docs/security/data-boundaries.md`](docs/security/data-boundaries.md).

## Roadmap

Ordem de implementação da seção 39 da especificação. Incremento 1 cobre os
passos 1–10 (fundação + API de leitura + geo + Swagger); incremento 2 cobre
autenticação e a assinatura do Premium; incremento 3 entrega o
cliente web (PWA), o design system em código e o domínio compartilhado.
Próximos: publicação da API, app mobile (Expo), alertas de preço,
contribuições da comunidade, notificações e observabilidade.
