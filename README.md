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
  web / corpo no mobile) e **Premium vitalício** (compra única de R$ 9,99 via
  Asaas, cobrança avulsa/Pix+cartão, webhook idempotente). Ver
  [`docs/architecture/auth-billing.md`](docs/architecture/auth-billing.md).
- **Docker Compose** (PostgreSQL+PostGIS, Redis, API), `.env.example` e docs.

⏳ Próximos incrementos (não incluídos aqui): app mobile (Expo), web/PWA
(Next.js), favoritos, alertas, veículos, recarga elétrica, contribuições,
notificações, LGPD e design system em código. Ver [seção "Roadmap"](#roadmap).

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
| `pnpm css:build` | Compila o CSS do site estático |
| `pnpm site:serve` | Serve `public/` localmente |

## Estrutura

```
apps/api/               API pública de leitura
packages/database/      Prisma + PostGIS + camada pública derivada + seed
packages/shared-types/  Contratos TypeScript compartilhados
docker/                 Dockerfile da API
docs/                   architecture · security · api · product
design-system/          Tokens de marca (DESIGN.md)
brand/                  Arte-mestra da marca (logo original)
tools/                  Build do site estático (Tailwind + normalização das telas)
public/                 >>> ÚNICO diretório publicado no Netlify <<<
netlify.toml            publish = public, headers de segurança, redirects
```

## Site estático (galeria de protótipos)

`public/` é o **único** diretório publicado. Nada de `apps/`, `packages/`,
`docs/` ou `docker/` vai para o CDN — o `netlify.toml` fixa `publish = "public"`
e ainda devolve 404 para esses caminhos, caso alguém tenha um link antigo de
quando a raiz do repositório era publicada.

O que está no ar é a **galeria de protótipos de interface**, não a plataforma:
as telas são estáticas e os preços exibidos são fictícios. Por isso o site sai
com `noindex` (`robots.txt` + header `X-Robots-Tag`) até a plataforma real
entrar no ar.

O site não faz nenhuma chamada a terceiros: Tailwind é compilado localmente,
as fontes são auto-hospedadas e as ilustrações são SVGs versionados no repo.

```bash
pnpm css:build      # compila public/assets/css/app.css
pnpm site:serve     # serve public/ em http://localhost:4173
node tools/build-screens.mjs           # normaliza as telas do Stitch
node tools/build-screens.mjs --check   # falha se algo estiver fora do padrão
```

`tools/build-screens.mjs` é idempotente e cuida do que o export do Stitch
deixava quebrado: remove o Tailwind Play CDN e os links do Google Fonts, troca
as URLs efêmeras de imagem por assets locais, converte os ícones para
codepoints (a fonte é subsetada), liga a navegação inferior às telas reais,
adiciona rótulos acessíveis e devolve o link de volta para a galeria.

## Segurança

Nenhum dado interno da coleta é exposto. A fonte pública é sempre
**"Banco de Dados Posto Barato"**; os preços não são declarados oficiais nem em
tempo real. Detalhes em [`docs/security/data-boundaries.md`](docs/security/data-boundaries.md).

## Roadmap

Ordem de implementação da seção 39 da especificação. Incremento 1 cobre os
passos 1–10 (fundação + API de leitura + geo + Swagger); incremento 2 cobre
autenticação e o Premium vitalício (pagamento único). Próximos: clientes
(mobile/web), favoritos/alertas/veículos, recarga elétrica, notificações e
observabilidade.
