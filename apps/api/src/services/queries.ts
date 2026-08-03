/**
 * Camada de acesso a dados públicos da API.
 *
 * Duas regras valem para tudo aqui:
 *
 * 1. Conexão de leitura, sempre — `readonlyDb()` fala com `price_reader`, que
 *    não tem INSERT, UPDATE nem DELETE em lugar nenhum do banco. Uma rota de
 *    preços não consegue gravar nem se alguém escrever o SQL para isso.
 * 2. Origem única — tudo sai de `app.public_latest_prices` (ou das views
 *    `collector.*`, no histórico). Colunas privadas não existem nesses objetos,
 *    então não há projeção a esquecer.
 *
 * Proximidade usa PostGIS sobre índice GIST (ST_DWithin / ST_Distance), nunca
 * cálculo linha a linha na aplicação.
 */
import { Prisma, readonlyDb } from '@posto-barato/database';
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

/**
 * Colunas públicas devolvidas ao projetor. Declaradas em um lugar só para que
 * uma rota nova não recomece a lista e inclua algo que não devia — embora a
 * matview, por não conter coluna privada, já torne isso impossível.
 *
 * `is_expired` é derivado no momento da consulta, e não gravado na matview: o
 * vencimento depende do relógio, e um `now()` congelado no último refresh diria
 * que o preço ainda vale horas depois de ter vencido.
 */
const PUBLIC_COLUMNS = Prisma.sql`
  station_id, station_name, station_address, neighborhood, municipality, state,
  postal_code, latitude, longitude, is_demo, product_code, product_name,
  price, currency, unit, observed_at, observed_at_estimated, collected_at,
  confidence_score, source_name,
  (price_status = 'EXPIRED' OR (expires_at IS NOT NULL AND expires_at <= now())) AS is_expired`;

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
    // Pela data de negócio: "atualizado nas últimas 6 horas" é uma pergunta
    // sobre quando o preço valia na bomba, não sobre quando nós o coletamos.
    conds.push(
      Prisma.sql`observed_at >= now() - make_interval(hours => ${f.updatedWithinHours}::int)`,
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
        ? Prisma.sql`last_observed DESC`
        : Prisma.sql`lowest_price ASC`; // lowest_price e best_savings

  return readonlyDb().$queryRaw<StationPageRow[]>`
    SELECT station_id,
           MIN(price) AS lowest_price,
           MAX(observed_at) AS last_observed,
           ${distance} AS distance_km
    FROM app.public_latest_prices
    ${where}
    GROUP BY station_id, geog
    ORDER BY ${order}
    LIMIT ${f.limit} OFFSET ${f.offset}`;
}

export async function countStations(f: StationFilters): Promise<number> {
  const where = buildWhere(f);
  const rows = await readonlyDb().$queryRaw<{ total: number }[]>`
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
  // `= ANY($1::uuid[])` e não `station_id::text IN (...)`: converter a coluna
  // para texto descarta o índice sobre o UUID e força varredura completa, e o
  // custo cresce junto com a página.
  return readonlyDb().$queryRaw<PublicPriceRow[]>`
    SELECT ${PUBLIC_COLUMNS}
    FROM app.public_latest_prices
    WHERE station_id = ANY(${stationIds}::uuid[]) ${productCond}
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
  return readonlyDb().$queryRaw<PublicPriceRow[]>`
    SELECT ${PUBLIC_COLUMNS}, ${distance} AS distance_km
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
  observed_at: Date;
}

export async function querySummary(
  municipality: string,
  state: string,
  product?: string,
): Promise<SummaryRow[]> {
  const productCond = product ? Prisma.sql`AND product_code = ${product}` : Prisma.empty;
  return readonlyDb().$queryRaw<SummaryRow[]>`
    SELECT product_code,
           MIN(product_name) AS product_name,
           municipality, state,
           MIN(price)::float8 AS min,
           ROUND(AVG(price), 3)::float8 AS avg,
           MAX(price)::float8 AS max,
           COUNT(DISTINCT station_id)::int AS station_count,
           MAX(observed_at) AS observed_at
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
 * Histórico agregado por dia (seção 13). A agregação acontece no banco; nunca
 * enviamos milhares de observações ao cliente.
 *
 * Lê `collector.price_observations` — a view, não a tabela — porque o histórico
 * completo não está na matview, que guarda só a observação mais recente. A view
 * já descarta PENDING e REJECTED na origem: um preço que nunca foi validado não
 * pode entrar nem na média nem no gráfico.
 */
export async function queryHistory(
  stationId: string,
  product: string,
  days: number,
): Promise<HistoryDayRow[]> {
  return readonlyDb().$queryRaw<HistoryDayRow[]>`
    WITH observacoes AS (
      SELECT COALESCE(po.observed_at, po.estimated_observed_at, po.collected_at) AS momento,
             po.price_decimal AS price
      FROM collector.price_observations po
      JOIN collector.products p ON p.id = po.product_id
      WHERE po.station_id = ${stationId}::uuid
        AND p.canonical_code = ${product}
        AND COALESCE(po.observed_at, po.estimated_observed_at, po.collected_at)
            >= now() - make_interval(days => ${days}::int)
    )
    SELECT to_char(date_trunc('day', momento), 'YYYY-MM-DD') AS date,
           MIN(price)::float8 AS min,
           MAX(price)::float8 AS max,
           ROUND(AVG(price), 3)::float8 AS avg,
           COUNT(*)::int AS count
    FROM observacoes
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
  const rows = await readonlyDb().$queryRaw<MunicipalHistoryRow[]>`
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
