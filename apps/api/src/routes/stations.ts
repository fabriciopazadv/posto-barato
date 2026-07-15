import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { notFound } from '../plugins/errors.js';
import { getStationDetail, listStations } from '../services/read.service.js';
import type { Origin, StationFilters } from '../services/queries.js';
import { originQuery, stationIdParams, stationsQuerySchema } from '../schemas.js';

export function registerStationRoutes(app: FastifyInstance, ctx: AppContext): void {
  const querySchema = stationsQuerySchema(ctx.env.MAX_PAGE_SIZE, ctx.env.MAX_RADIUS_KM);

  app.get(
    '/stations',
    {
      schema: {
        tags: ['postos'],
        summary: 'Lista/pesquisa de postos com preços (proximidade, filtros, ordenação)',
        description:
          'Parâmetros: latitude, longitude, radiusKm, municipality, state, product, minPrice, maxPrice, updatedWithinHours, sort (lowest_price|nearest|best_savings|most_recent), page, limit.',
      },
    },
    async (request) => {
      const q = querySchema.parse(request.query);
      const origin: Origin | undefined =
        q.latitude !== undefined && q.longitude !== undefined
          ? { latitude: q.latitude, longitude: q.longitude }
          : undefined;
      const radiusKm = origin ? (q.radiusKm ?? ctx.env.MAX_RADIUS_KM) : undefined;

      const filters: StationFilters = {
        product: q.product,
        municipality: q.municipality,
        state: q.state,
        origin,
        radiusKm,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
        updatedWithinHours: q.updatedWithinHours,
        sort: q.sort,
        limit: q.limit,
        offset: (q.page - 1) * q.limit,
      };
      return listStations(filters, ctx.thresholds);
    },
  );

  app.get(
    '/stations/:id',
    { schema: { tags: ['postos'], summary: 'Detalhes de um posto' } },
    async (request) => {
      const { id } = stationIdParams.parse(request.params);
      const { latitude, longitude } = originQuery.parse(request.query);
      const origin =
        latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
      const station = await getStationDetail(id, ctx.thresholds, origin);
      if (!station) throw notFound('Posto não encontrado');
      return station;
    },
  );

  app.get(
    '/stations/:id/prices',
    { schema: { tags: ['postos'], summary: 'Preços mais recentes de um posto' } },
    async (request) => {
      const { id } = stationIdParams.parse(request.params);
      const station = await getStationDetail(id, ctx.thresholds);
      if (!station) throw notFound('Posto não encontrado');
      return { stationId: id, source: station.source, prices: station.prices };
    },
  );
}
