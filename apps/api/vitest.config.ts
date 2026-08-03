import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integração exige banco; roda por `pnpm test:integration`, com config
    // própria. `pnpm test` continua rodando em qualquer máquina, sem infra.
    exclude: ['test/integration/**'],
    environment: 'node',
  },
});
