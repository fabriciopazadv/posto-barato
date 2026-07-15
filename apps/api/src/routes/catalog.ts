import type { FastifyInstance } from 'fastify';
import type { PublicConfig } from '@posto-barato/shared-types';
import type { AppContext } from '../context.js';
import { CONFIRM_NOTICE, NOT_REALTIME_NOTICE, PUBLIC_SOURCE } from '../domain/projection.js';
import { listMunicipalities, listProducts } from '../services/read.service.js';

export function registerCatalogRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    '/public/config',
    { schema: { tags: ['catálogo'], summary: 'Configuração pública do cliente' } },
    async (): Promise<PublicConfig> => ({
      environment: ctx.env.NODE_ENV,
      demoMode: ctx.env.DEMO_MODE,
      source: PUBLIC_SOURCE,
      freshnessThresholdsHours: {
        recent: ctx.thresholds.recentHours,
        moderate: ctx.thresholds.moderateHours,
        old: ctx.thresholds.oldHours,
      },
      maxPageSize: ctx.env.MAX_PAGE_SIZE,
      maxRadiusKm: ctx.env.MAX_RADIUS_KM,
      defaultMunicipality: ctx.env.DEFAULT_MUNICIPALITY,
      defaultState: ctx.env.DEFAULT_STATE,
      notices: [CONFIRM_NOTICE, NOT_REALTIME_NOTICE],
      features: {
        chargingStations: ctx.env.FEATURE_CHARGING_STATIONS,
      },
    }),
  );

  app.get(
    '/products',
    { schema: { tags: ['catálogo'], summary: 'Lista de produtos (combustíveis)' } },
    async () => ({ data: await listProducts() }),
  );

  app.get(
    '/municipalities',
    { schema: { tags: ['catálogo'], summary: 'Municípios com dados disponíveis' } },
    async () => ({ data: await listMunicipalities() }),
  );
}
