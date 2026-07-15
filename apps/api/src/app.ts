import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Env } from './config/env.js';
import { buildContext } from './context.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { registerErrorHandling } from './plugins/errors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPriceRoutes } from './routes/prices.js';
import { registerStationRoutes } from './routes/stations.js';

const API_PREFIX = '/api/v1';

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const ctx = buildContext(env);
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Redação defensiva de cabeçalhos sensíveis nos logs (seção 32).
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  app.decorate('authSecret', ctx.auth.accessSecret);
  await app.register(registerAuthPlugin);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'API Posto Barato',
        description:
          'API pública de leitura do Banco de Dados Posto Barato. Os preços não são em tempo real; confirme no estabelecimento antes de abastecer.',
        version: '0.2.0',
      },
      servers: [{ url: API_PREFIX }],
      tags: [
        { name: 'sistema', description: 'Saúde e prontidão' },
        { name: 'catálogo', description: 'Configuração, produtos e municípios' },
        { name: 'postos', description: 'Consulta de postos e preços' },
        { name: 'preços', description: 'Resumos, comparação e histórico' },
        { name: 'auth', description: 'Conta, login e sessão' },
        { name: 'billing', description: 'Compra do Premium vitalício' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerErrorHandling(app);

  await app.register(
    async (instance) => {
      registerHealthRoutes(instance);
      registerCatalogRoutes(instance, ctx);
      registerStationRoutes(instance, ctx);
      registerPriceRoutes(instance, ctx);
      registerAuthRoutes(instance, ctx);
      registerBillingRoutes(instance, ctx);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
