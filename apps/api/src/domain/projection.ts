import type {
  PublicPrice,
  PublicStationDetail,
  PublicStationSummary,
} from '@posto-barato/shared-types';
import {
  ageMinutesFrom,
  classifyConfidence,
  classifyFreshness,
  type FreshnessThresholds,
} from './freshness.js';

/** Fonte pública única — nunca a fonte interna do coletor (seções 2, 11). */
export const PUBLIC_SOURCE = 'Banco de Dados Posto Barato';

export const CONFIRM_NOTICE =
  'Os preços podem sofrer alterações. Confirme as condições no estabelecimento antes de abastecer.';
export const NOT_REALTIME_NOTICE =
  'As informações provêm do Banco de Dados Posto Barato e não são atualizadas em tempo real.';
export const DEMO_NOTICE = 'Dados demonstrativos.';

/**
 * Linha crua vinda de app.public_latest_prices. Contém APENAS campos públicos —
 * a matview não seleciona evidências, raw_visible_data nem caminhos internos.
 * Campos numéricos podem chegar como string (numeric do Postgres via raw query).
 */
export interface PublicPriceRow {
  station_id: string;
  station_name: string;
  station_address: string;
  neighborhood: string | null;
  municipality: string;
  state: string;
  postal_code: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  is_demo: boolean;
  product_code: string;
  product_name: string;
  price: string | number;
  currency: string;
  unit: string;
  estimated_observed_at: Date | string | null;
  estimated_time: boolean;
  collected_at: Date | string;
  confidence_score: string | number;
  distance_km?: string | number | null;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toPublicPrice(
  row: PublicPriceRow,
  thresholds: FreshnessThresholds,
  now: Date = new Date(),
): PublicPrice {
  const collectedAt = asDate(row.collected_at);
  const ageMinutes = ageMinutesFrom(collectedAt, now);
  const observedAt = row.estimated_observed_at ? asDate(row.estimated_observed_at) : null;
  return {
    productCode: row.product_code,
    productName: row.product_name,
    price: num(row.price) ?? 0,
    currency: row.currency,
    unit: row.unit,
    observedAt: observedAt ? observedAt.toISOString() : null,
    observedAtEstimated: row.estimated_time,
    collectedAt: collectedAt.toISOString(),
    ageMinutes,
    freshness: classifyFreshness(ageMinutes, thresholds),
    confidence: classifyConfidence(num(row.confidence_score) ?? 1),
  };
}

/** Agrupa linhas (posto+produto) em resumos por posto, com menor preço. */
export function groupStations(
  rows: PublicPriceRow[],
  thresholds: FreshnessThresholds,
  now: Date = new Date(),
): PublicStationSummary[] {
  const byStation = new Map<string, { row: PublicPriceRow; prices: PublicPrice[] }>();
  for (const row of rows) {
    let entry = byStation.get(row.station_id);
    if (!entry) {
      entry = { row, prices: [] };
      byStation.set(row.station_id, entry);
    }
    entry.prices.push(toPublicPrice(row, thresholds, now));
  }

  return [...byStation.values()].map(({ row, prices }) => {
    const lowest = prices.reduce<PublicPrice | null>(
      (min, p) => (min === null || p.price < min.price ? p : min),
      null,
    );
    return {
      id: row.station_id,
      name: row.station_name,
      address: row.station_address,
      neighborhood: row.neighborhood,
      municipality: row.municipality,
      state: row.state,
      latitude: num(row.latitude),
      longitude: num(row.longitude),
      distanceKm: row.distance_km !== undefined ? num(row.distance_km) : null,
      isDemo: row.is_demo,
      lowestPrice: lowest,
      prices,
    };
  });
}

export function toStationDetail(
  summary: PublicStationSummary,
  postalCode: string | null,
): PublicStationDetail {
  const notices = [CONFIRM_NOTICE, NOT_REALTIME_NOTICE];
  if (summary.isDemo) notices.unshift(DEMO_NOTICE);
  if (summary.prices.some((p) => p.freshness === 'EXPIRED')) {
    notices.push('Alguns preços estão desatualizados e podem não refletir o valor atual.');
  }
  return {
    ...summary,
    postalCode,
    source: PUBLIC_SOURCE,
    notices,
  };
}
