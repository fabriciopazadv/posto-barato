/**
 * Ponto de entrada do pacote de banco. Exporta um PrismaClient singleton e os
 * tipos gerados. A API consome este cliente; nunca abre conexão própria.
 */
import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Nome da matview pública derivada (fronteira de segurança física). */
export const PUBLIC_PRICES_VIEW = 'app.public_latest_prices';
