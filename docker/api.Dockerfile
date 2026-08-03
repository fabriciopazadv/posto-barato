# Imagem da API Posto Barato (Fase 2).
#
# Estágios:
#   deps    dependências do monorepo (cacheável)
#   tools   diagnóstico e migrações — `pnpm db:doctor`, `pnpm db:migrate`
#   build   compila shared-types → domain → database → api
#   runtime imagem final, só o que `node dist/server.js` precisa
#
#   docker build --target tools   -t posto-barato-phase2-tools -f docker/api.Dockerfile .
#   docker build --target runtime -t posto-barato-api          -f docker/api.Dockerfile .
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# O engine do Prisma é ligado ao OpenSSL. Sem ele o cliente falha ao carregar a
# biblioteca, e o erro só aparece no primeiro acesso ao banco — depois de a
# imagem já estar publicada.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# --- deps: instala dependências do monorepo ---------------------------------
# Todos os manifestos do workspace entram aqui. Faltando um, o pnpm não resolve
# o lockfile — e o `|| pnpm install` que existia aqui transformava isso em uma
# instalação sem trava, com versões diferentes das testadas e sem aviso.
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types/package.json  packages/shared-types/
COPY packages/domain/package.json        packages/domain/
COPY packages/database/package.json      packages/database/
COPY packages/design-system/package.json packages/design-system/
COPY apps/api/package.json               apps/api/
RUN pnpm install --frozen-lockfile --filter "@posto-barato/api..."

# --- tools: diagnóstico e migrações -----------------------------------------
# Não compila a API: estes comandos rodam por tsx, direto do fonte.
#
#   docker run --rm --add-host host.docker.internal:host-gateway \
#     -e DATABASE_URL=postgresql://usuario:senha@host.docker.internal:5432/posto_barato \
#     posto-barato-phase2-tools pnpm db:doctor
FROM deps AS tools
COPY . .
RUN pnpm --filter @posto-barato/database exec prisma generate
CMD ["pnpm", "db:doctor"]

# --- build ------------------------------------------------------------------
# `"@posto-barato/api..."` (com as reticências) inclui as dependências do
# workspace e as constrói em ordem topológica: shared-types → domain → database
# → api. A API importa o `dist/` desses pacotes, não o fonte.
FROM deps AS build
COPY . .
RUN pnpm --filter "@posto-barato/api..." build

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# Sem root: um processo exposto à internet não precisa poder escrever sobre a
# própria imagem. O usuário `node` já vem na imagem oficial.
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3333
# `dist/server.js` só resolve @posto-barato/* porque os pacotes publicam dist/ —
# ver o campo `exports` de cada package.json.
CMD ["node", "dist/server.js"]
