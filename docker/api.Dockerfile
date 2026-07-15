# Imagem da API Posto Barato (Fase 2).
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# --- deps: instala dependências do monorepo ---------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile || pnpm install

# --- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @posto-barato/database generate \
 && pnpm --filter @posto-barato/api build

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3333
CMD ["node", "dist/server.js"]
