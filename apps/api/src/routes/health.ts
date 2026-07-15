import type { FastifyInstance } from 'fastify';
import type { HealthStatus } from '@posto-barato/shared-types';
import { pingDatabase } from '../services/read.service.js';

const startedAt = Date.now();

export function registerHealthRoutes(app: FastifyInstance): void {
  // Liveness — não toca dependências (seção 38).
  app.get('/health', { schema: { tags: ['sistema'], summary: 'Liveness' } }, async (): Promise<HealthStatus> => {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.2.0',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
  });

  // Readiness — verifica o banco sem expor detalhes internos.
  app.get('/ready', { schema: { tags: ['sistema'], summary: 'Readiness' } }, async (_req, reply) => {
    const dbOk = await pingDatabase();
    reply.status(dbOk ? 200 : 503).send({ status: dbOk ? 'ok' : 'degraded' });
  });
}
