import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { badRequest, notFound } from '../plugins/errors.js';
import {
  comparePrices,
  getStationDetail,
  listStations,
  priceHistory,
  priceSummary,
} from '../services/read.service.js';
import {
  compareBody,
  historyQuery,
  latestQuery,
  stationIdParams,
  summaryQuery,
} from '../schemas.js';

export function registerPriceRoutes(app: FastifyInstance, ctx: AppContext): void {
  // Menor preço/observações mais recentes por município (lista compacta).
  app.get(
    '/prices/latest',
    { schema: { tags: ['preços'], summary: 'Preços mais recentes por município' } },
    async (request) => {
      const q = latestQuery.parse(request.query);
      const result = await listStations(
        {
          product: q.product,
          municipality: q.municipality,
          state: q.state,
          sort: 'lowest_price',
          limit: ctx.env.MAX_PAGE_SIZE,
          offset: 0,
        },
        ctx.thresholds,
      );
      return result;
    },
  );

  // Resumo estatístico (min/média/max) por produto no município.
  app.get(
    '/prices/summary',
    { schema: { tags: ['preços'], summary: 'Resumo de preços por município' } },
    async (request) => {
      const q = summaryQuery.parse(request.query);
      return { data: await priceSummary(q.municipality, q.state, q.product) };
    },
  );

  // Comparação de até 3 postos + economia real (seção 12).
  app.post(
    '/prices/compare',
    { schema: { tags: ['preços'], summary: 'Comparação de economia entre postos' } },
    async (request) => {
      const body = compareBody.parse(request.body);
      const origin =
        body.originLatitude !== undefined && body.originLongitude !== undefined
          ? { latitude: body.originLatitude, longitude: body.originLongitude }
          : undefined;
      return comparePrices(body.stationIds, body.productCode, ctx.thresholds, {
        origin,
        desiredLiters: body.desiredLiters,
        amountToSpend: body.amountToSpend,
        vehicleConsumptionKmPerLiter: body.vehicleConsumptionKmPerLiter,
      });
    },
  );

  // Histórico agregado por dia (7/30/90) — seção 13.
  app.get(
    '/stations/:id/history',
    { schema: { tags: ['preços'], summary: 'Histórico de preços de um posto' } },
    async (request) => {
      const { id } = stationIdParams.parse(request.params);
      const q = historyQuery.parse(request.query);
      const station = await getStationDetail(id, ctx.thresholds);
      if (!station) throw notFound('Posto não encontrado');
      if (!station.prices.some((p) => p.productCode === q.product)) {
        throw badRequest('Produto não disponível neste posto');
      }
      return priceHistory(id, q.product, q.windowDays);
    },
  );
}
