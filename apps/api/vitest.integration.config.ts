import { defineConfig } from 'vitest/config';

/**
 * Testes de integração — exigem um PostgreSQL 16 com PostGIS acessível por
 * `TEST_DATABASE_URL`. Ficam em configuração separada porque `pnpm test` precisa
 * continuar rodando sem infraestrutura nenhuma.
 */
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup-env.ts'],
    // Um banco só, compartilhado: arquivos em paralelo truncariam os dados uns
    // dos outros no meio das asserções.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
