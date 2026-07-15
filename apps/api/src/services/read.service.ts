import { Prisma, prisma } from '@posto-barato/database';
import type {
  CompareResult,
  Municipality,
  Paginated,
  PriceHistory,
  PriceSummary,
  Product,
  ProductCategory,
  PriceTrend,
  PublicStationDetail,
  PublicStationSummary,
} from '@posto-barato/shared-types';
import type { FreshnessThresholds } from '../domain/freshness.js';
import { groupStations, toStationDetail } from '../domain/projection.js';
import { computeComparison, type CompareCandidate } from '../domain/savings.js';
import {
  countStations,
  queryHistory,
  queryMunicipalAggregate,
  queryPriceRowsForStations,
  queryStationById,
  queryStationPage,
  querySummary,
  type Origin,
  type StationFilters,
} from './queries.js';

export async function listProducts(): Promise<Product[]> {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { canonicalCode: 'asc' },
  });
  return products.map((p) => ({
    code: p.canonicalCode,
    name: p.canonicalName,
    category: (p.category === 'FUEL' ? 'FUEL' : 'OTHER') as ProductCategory,
    unit: p.unit,
  }));
}

export async function listMunicipalities(): Promise<Municipality[]> {
  return prisma.$queryRaw<Municipality[]>`
    SELECT municipality, state, COUNT(DISTINCT station_id)::int AS "stationCount"
    FROM app.public_latest_prices
    GROUP BY municipality, state
    ORDER BY municipality`;
}

export async function listStations(
  filters: StationFilters,
  thresholds: FreshnessThresholds,
): Promise<Paginated<PublicStationSummary>> {
  const [page, total] = await Promise.all([
    queryStationPage(filters),
    countStations(filters),
  ]);
  const stationIds = page.map((r) => r.station_id);
  const rows = await queryPriceRowsForStations(stationIds, filters.product);

  const grouped = groupStations(rows, thresholds);
  const byId = new Map(grouped.map((s) => [s.id, s]));
  const distanceById = new Map(page.map((r) => [r.station_id, r.distance_km]));

  // Preserva a ordem definida pelo banco e injeta a distância calculada.
  const data = stationIds
    .map((id) => {
      const station = byId.get(id);
      if (!station) return null;
      return { ...station, distanceKm: distanceById.get(id) ?? null };
    })
    .filter((s): s is PublicStationSummary => s !== null);

  return {
    data,
    page: Math.floor(filters.offset / filters.limit) + 1,
    limit: filters.limit,
    total,
    hasNextPage: filters.offset + filters.limit < total,
  };
}

export async function getStationDetail(
  stationId: string,
  thresholds: FreshnessThresholds,
  origin?: Origin,
): Promise<PublicStationDetail | null> {
  const rows = await queryStationById(stationId, origin);
  if (rows.length === 0) return null;
  const [summary] = groupStations(rows, thresholds);
  if (!summary) return null;
  const first = rows[0]!;
  const withDistance: PublicStationSummary = {
    ...summary,
    distanceKm: first.distance_km !== undefined ? Number(first.distance_km) : null,
  };
  return toStationDetail(withDistance, first.postal_code);
}

export async function priceSummary(
  municipality: string,
  state: string,
  product?: string,
): Promise<PriceSummary[]> {
  const rows = await querySummary(municipality, state, product);
  return rows.map((r) => ({
    productCode: r.product_code,
    productName: r.product_name,
    municipality: r.municipality,
    state: r.state,
    min: Number(r.min),
    avg: Number(r.avg),
    max: Number(r.max),
    stationCount: r.station_count,
    collectedAt: new Date(r.collected_at).toISOString(),
  }));
}

export async function comparePrices(
  stationIds: string[],
  product: string,
  thresholds: FreshnessThresholds,
  params: {
    origin?: Origin;
    desiredLiters?: number;
    amountToSpend?: number;
    vehicleConsumptionKmPerLiter?: number;
  },
): Promise<CompareResult> {
  const summaries = await Promise.all(
    stationIds.map((id) => getStationDetail(id, thresholds, params.origin)),
  );
  const candidates: CompareCandidate[] = [];
  for (const s of summaries) {
    if (!s) continue;
    const price = s.prices.find((p) => p.productCode === product);
    if (!price) continue;
    candidates.push({
      stationId: s.id,
      stationName: s.name,
      pricePerLiter: price.price,
      distanceKm: s.distanceKm,
      freshness: price.freshness,
    });
  }
  return computeComparison(product, candidates, params);
}

export async function priceHistory(
  stationId: string,
  product: string,
  windowDays: number,
): Promise<PriceHistory> {
  const [days, municipal] = await Promise.all([
    queryHistory(stationId, product, windowDays),
    queryMunicipalAggregate(stationId, product),
  ]);
  const points = days.map((d) => ({
    date: d.date,
    min: Number(d.min),
    max: Number(d.max),
    avg: Number(d.avg),
    count: d.count,
  }));
  const prices = points.map((p) => p.avg);
  const min = points.length ? Math.min(...points.map((p) => p.min)) : null;
  const max = points.length ? Math.max(...points.map((p) => p.max)) : null;
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

  let trend: PriceTrend = 'STABLE';
  if (points.length >= 2) {
    const first = points[0]!.avg;
    const last = points[points.length - 1]!.avg;
    const delta = last - first;
    if (Math.abs(delta) >= 0.02) trend = delta > 0 ? 'UP' : 'DOWN';
  }

  return {
    stationId,
    productCode: product,
    windowDays,
    points,
    min,
    max,
    avg: avg !== null ? Math.round(avg * 1000) / 1000 : null,
    trend,
    municipalAvg: municipal.municipal_avg,
    municipalMin: municipal.municipal_min,
  };
}

/** Verificação de saúde da dependência de banco (sem expor detalhes internos). */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
