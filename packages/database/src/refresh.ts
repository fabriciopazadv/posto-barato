/**
 * Atualiza a camada pública derivada (matview). Deve ser chamado após cada
 * coleta relevante da Fase 1. Exposto como script (`pnpm --filter
 * @posto-barato/database refresh`) e reutilizável por um worker/BullMQ.
 */
import { prisma } from './index.js';

export async function refreshPublicPrices(): Promise<void> {
  await prisma.$executeRawUnsafe('SELECT app.refresh_public_prices();');
}

// Execução direta via CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshPublicPrices()
    .then(() => {
      console.log('[refresh] app.public_latest_prices atualizada.');
      return prisma.$disconnect();
    })
    .catch((err: unknown) => {
      console.error('[refresh] falhou:', err);
      process.exitCode = 1;
    });
}
