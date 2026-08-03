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
} from '@posto-barato/domain';

/** Fonte pública única — nunca a fonte interna do coletor (seções 2, 11). */
export const PUBLIC_SOURCE = 'Banco de Dados Posto Barato';

export const CONFIRM_NOTICE =
  'Os preços podem sofrer alterações. Confirme as condições no estabelecimento antes de abastecer.';
export const NOT_REALTIME_NOTICE =
  'As informações provêm do Banco de Dados Posto Barato e não são atualizadas em tempo real.';
export const DEMO_NOTICE = 'Dados demonstrativos.';

/**
 * Linha crua vinda de app.public_latest_prices. Contém APENAS campos públicos —
 * a matview não seleciona evidências, payload bruto nem caminhos internos.
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
  /** Data de negócio: quando o preço valia na bomba. Nunca nula na projeção. */
  observed_at: Date | string;
  /** true quando a hora foi inferida, e não lida diretamente da fonte. */
  observed_at_estimated: boolean;
  /** Quando o dado entrou no Banco de Dados Posto Barato. */
  collected_at: Date | string;
  /** A fonte marcou a observação como vencida, ou `expires_at` já passou. */
  is_expired: boolean;
  confidence_score: string | number;
  /** Nome público da fonte. Nunca o nome interno do coletor. */
  source_name: string;
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

/**
 * Converte uma linha da projeção no preço público.
 *
 * A idade é medida a partir da DATA DE NEGÓCIO, não da coleta. Um preço visto na
 * bomba há três dias e recoletado há uma hora tem três dias de idade — medir
 * pela coleta o classificaria como RECENT e diria ao usuário que é de agora.
 *
 * O frescor tem duas origens que se somam: o relógio (as faixas configuráveis
 * RECENT/MODERATE/OLD) e a própria fonte, que pode ter marcado a observação como
 * vencida antes disso. Quando a fonte diz que venceu, `EXPIRED` prevalece — ela
 * sabe da validade do dado o que o relógio não sabe.
 */
export function toPublicPrice(
  row: PublicPriceRow,
  thresholds: FreshnessThresholds,
  now: Date = new Date(),
): PublicPrice {
  const observedAt = asDate(row.observed_at);
  const collectedAt = asDate(row.collected_at);
  const ageMinutes = ageMinutesFrom(observedAt, now);
  return {
    productCode: row.product_code,
    productName: row.product_name,
    price: num(row.price) ?? 0,
    currency: row.currency,
    unit: row.unit,
    observedAt: observedAt.toISOString(),
    observedAtEstimated: row.observed_at_estimated,
    collectedAt: collectedAt.toISOString(),
    ageMinutes,
    freshness: row.is_expired ? 'EXPIRED' : classifyFreshness(ageMinutes, thresholds),
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
