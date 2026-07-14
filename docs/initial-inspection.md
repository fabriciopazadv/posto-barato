# Relatório técnico inicial

O repositório continha apenas o arquivo `stitch_posto_barato_mobilidade_e_economia.zip` e metadados Git. Não havia README, package.json, TypeScript, Prisma, migrations, Docker ou código executável. O ZIP contém protótipos visuais fora do escopo da primeira fase e foi preservado.

A implementação adotou Node.js 22, TypeScript strict, Playwright, PostgreSQL 16, Prisma, Zod, Pino, Vitest, ESLint, Prettier e pnpm. O banco criado usa o schema lógico `collector`.

Riscos: seletores reais do Nota MT dependem de sessão autenticada e devem ser confirmados com `pnpm diagnose`; autenticação permanece manual; evidências são restritas ao container de resultados quando disponível; perfil, logs, evidências e snapshots não são versionados.
