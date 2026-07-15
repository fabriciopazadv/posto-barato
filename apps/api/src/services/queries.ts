/**
 * Camada de acesso a dados da API. TODAS as leituras públicas passam pela
 * matview `app.public_latest_prices`, que contém exclusivamente campos públicos
 * — é a fronteira física que impede o vazamento de evidências, raw_visible_data
 * ou identificadores internos. As consultas por proximidade usam PostGIS
 * (ST_DWithin/ST_Distance sobre índice GIST), nunca cálculo linha a linha no app.
 */
import { Prisma, prisma } from '@posto-barato/database';
import type { PublicPriceRow } from '../domain/projection.js';

export interface Origin {
  latitude: number;
  longitude: number;
}

export interface StationFilters {
  product?: string;
  municipality?: string;
  state?: string;
  origin?: Origin;
  radiusKm?: number;
  minPrice?: number;
  maxPrice?: number;
  updatedWithinHours?: number;
  sort: 'lowest_price' | 'nearest' | 'best_savings' | 'most_recent';
  limit: number;
  offset: number;
}

function originGeog(origin: Origin): Prisma.Sql {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${origin.longitude}::float8, ${origin.latitude}::float8), 4326)::geography`;
}

function buildWhere(f: StationFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [];
  if (f.product) conds.push(Prisma.sql`product_code = ${f.product}`);
  if (f.municipality) conds.push(Prisma.sql`municipality = ${f.municipality}`);
  if (f.state) conds.push(Prisma.sql`state = ${f.state}`);
  if (f.minPrice !== undefined) conds.push(Prisma.sql`price >= ${f.minPrice}`);
  if (f.maxPrice !== undefined) conds.push(Prisma.sql`price <= ${f.maxPrice}`);
  if (f.updatedWithinHours !== undefined) {
    conds.push(
      Prisma.sql`collected_at >= now() - make_interval(hours => ${f.updatedWithinHours}::int)`,
    );
  }
  if (f.origin && f.radiusKm !== undefined) {
    conds.push(
      Prisma.sql`geog IS NOT NULL AND ST_DWithin(geog, ${originGeog(f.origin)}, ${f.radiusKm * 1000})`,
    );
  }
  return conds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
}

export interface StationPageRow {
  station_id: string;
  distance_km: number | null;
}

/** Página de postos (nível estação): ordena e pagina no banco. */
export async function queryStationPage(f: StationFilters): Promise<StationPageRow[]> {
  const where = buildWhere(f);
  const distance = f.origin
    ? Prisma.sql`ST_Distance(geog, ${originGeog(f.origin)}) / 1000.0`
    : Prisma.sql`NULL::float8`;

  const order =
    f.sort === 'nearest' && f.origin
      ? Prisma.sql`distance_km ASC NULLS LAST`
      : f.sort === 'most_recent'
        ? Prisma.sql`last_collected DESC`
        : Prisma.sql`lowest_price ASC`; // lowest_price e best_savings

  return prisma.$queryRaw<StationPageRow[]>`
    SELECT station_id,
           MIN(price) AS lowest_price,
           MAX(collected_at) AS last_collected,
           ${distance} AS distance_km
    FROM app.public_latest_prices
    ${where}
    GROUP BY station_id, geog
    ORDER BY ${order}
    LIMIT ${f.limit} OFFSET ${f.offset}`;
}

export async function countStations(f: StationFilters): Promise<number> {
  const where = buildWhere(f);
  const rows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COUNT(DISTINCT station_id)::int AS total
    FROM app.public_latest_prices
    ${where}`;
  return rows[0]?.total ?? 0;
}

/** Linhas públicas (posto+produto) para um conjunto de postos. */
export async function queryPriceRowsForStations(
  stationIds: string[],
  product?: string,
): Promise<PublicPriceRow[]> {
  if (stationIds.length === 0) return [];
  const productCond = product ? Prisma.sql`AND product_code = ${product}` : Prisma.empty;
  return prisma.$queryRaw<PublicPriceRow[]>`
    SELECT station_id, station_name, station_address, neighborhood, municipality, state,
           postal_code, latitude, longitude, is_demo, product_code, product_name,
           price, currency, unit, estimated_observed_at, estimated_time, collected_at,
           confidence_score
    FROM app.public_latest_prices
    WHERE station_id::text IN (${Prisma.join(stationIds)}) ${productCond}
    ORDER BY station_id, product_code`;
}

/** Detalhe de um posto (todas as linhas de preço), com distância opcional. */
export async function queryStationById(
  stationId: string,
  origin?: Origin,
): Promise<PublicPriceRow[]> {
  const distance = origin
    ? Prisma.sql`ST_Distance(geog, ${originGeog(origin)}) / 1000.0`
    : Prisma.sql`NULL::float8`;
  return prisma.$queryRaw<PublicPriceRow[]>`
    SELECT station_id, station_name, station_address, neighborhood, municipality, state,
           postal_code, latitude, longitude, is_demo, product_code, product_name,
           price, currency, unit, estimated_observed_at, estimated_time, collected_at,
           confidence_score, ${distance} AS distance_km
    FROM app.public_latest_prices
    WHERE station_id = ${stationId}::uuid
    ORDER BY product_code`;
}

export interface SummaryRow {
  product_code: string;
  product_name: string;
  municipality: string;
  state: string;
  min: number;
  avg: number;
  max: number;
  station_count: number;
  collected_at: Date;
}

export async function querySummary(
  municipality: string,
  state: string,
  product?: string,
): Promise<SummaryRow[]> {
  const productCond = product ? Prisma.sql`AND product_code = ${product}` : Prisma.empty;
  return prisma.$queryRaw<SummaryRow[]>`
    SELECT product_code,
           MIN(product_name) AS product_name,
           municipality, state,
           MIN(price)::float8 AS min,
           ROUND(AVG(price), 3)::float8 AS avg,
           MAX(price)::float8 AS max,
           COUNT(DISTINCT station_id)::int AS station_count,
           MAX(collected_at) AS collected_at
    FROM app.public_latest_prices
    WHERE municipality = ${municipality} AND state = ${state} ${productCond}
    GROUP BY product_code, municipality, state
    ORDER BY product_code`;
}

export interface HistoryDayRow {
  date: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

/**
 * Histórico agregado por dia (seção 13) — a agregação acontece no banco; nunca
 * enviamos milhares de observações ao cliente. Lê o histórico completo do
 * collector (não a matview, que só tem o mais recente).
 */
export async function queryHistory(
  stationId: string,
  product: string,
  days: number,
): Promise<HistoryDayRow[]> {
  return prisma.$queryRaw<HistoryDayRow[]>`
    SELECT to_char(date_trunc('day', po.collected_at), 'YYYY-MM-DD') AS date,
           MIN(po.price_decimal)::float8 AS min,
           MAX(po.price_decimal)::float8 AS max,
           ROUND(AVG(po.price_decimal), 3)::float8 AS avg,
           COUNT(*)::int AS count
    FROM collector.price_observations po
    JOIN collector.products p ON p.id = po.product_id
    WHERE po.station_id = ${stationId}::uuid
      AND p.canonical_code = ${product}
      AND po.collected_at >= now() - make_interval(days => ${days}::int)
    GROUP BY 1
    ORDER BY 1`;
}

export interface MunicipalHistoryRow {
  municipal_avg: number | null;
  municipal_min: number | null;
}

export async function queryMunicipalAggregate(
  stationId: string,
  product: string,
): Promise<MunicipalHistoryRow> {
  const rows = await prisma.$queryRaw<MunicipalHistoryRow[]>`
    SELECT ROUND(AVG(price), 3)::float8 AS municipal_avg,
           MIN(price)::float8 AS municipal_min
    FROM app.public_latest_prices
    WHERE product_code = ${product}
      AND (municipality, state) IN (
        SELECT municipality, state FROM app.public_latest_prices
        WHERE station_id = ${stationId}::uuid LIMIT 1
      )`;
  return rows[0] ?? { municipal_avg: null, municipal_min: null };
}
