/**
 * Camada de demonstração usada quando `NEXT_PUBLIC_API_URL` não está definida.
 *
 * Reproduz o seed de `packages/database/prisma/seed.ts` (Rondonópolis/MT) e
 * aplica as MESMAS regras de `@posto-barato/domain` que a API usa — frescor,
 * distância e cálculo de economia. O objetivo é que trocar do mock para a API
 * real não mude números na tela, só a origem deles.
 *
 * Nada aqui simula áreas autenticadas com dados de verdade: login e Premium
 * são tratados como indisponíveis sem API (ver `data.ts`).
 */
import {
  ageMinutesFrom,
  classifyConfidence,
  classifyFreshness,
  computeComparison,
  haversineKm,
  type CompareCandidate,
  type FreshnessThresholds,
} from '@posto-barato/domain';
import type {
  CompareInput,
  CompareResult,
  Municipality,
  Paginated,
  PriceHistory,
  PricePoint,
  PriceSummary,
  Product,
  PublicConfig,
  PublicPrice,
  PublicStationDetail,
  PublicStationSummary,
} from '@posto-barato/shared-types';

import { SOURCE_NAME } from './config';
import type { ChargingPoint, StationQuery } from './types';

const THRESHOLDS: FreshnessThresholds = {
  recentHours: 6,
  moderateHours: 24,
  oldHours: 72,
};

const MUNICIPALITY = 'Rondonópolis';
const STATE = 'MT';

export const NOTICES = [
  'Os preços podem sofrer alterações. Confirme as condições no estabelecimento antes de abastecer.',
  'As informações provêm do Banco de Dados Posto Barato e não são atualizadas em tempo real.',
];

const PRODUCTS: Product[] = [
  { code: 'ETANOL', name: 'Etanol', category: 'FUEL', unit: 'L' },
  { code: 'ETANOL_ADITIVADO', name: 'Etanol aditivado', category: 'FUEL', unit: 'L' },
  { code: 'GASOLINA_COMUM', name: 'Gasolina comum', category: 'FUEL', unit: 'L' },
  { code: 'GASOLINA_ADITIVADA', name: 'Gasolina aditivada', category: 'FUEL', unit: 'L' },
  { code: 'DIESEL_COMUM', name: 'Diesel comum', category: 'FUEL', unit: 'L' },
  { code: 'DIESEL_S10', name: 'Diesel S-10', category: 'FUEL', unit: 'L' },
  { code: 'GNV', name: 'GNV', category: 'FUEL', unit: 'M3' },
];

interface SeedStation {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  collectedHoursAgo: number;
  prices: Record<string, number>;
}

/** Mesmos postos, coordenadas e preços do seed demonstrativo. */
const SEED: SeedStation[] = [
  {
    id: 'a1000000-0000-4000-8000-000000000001',
    name: 'Posto Centro Avenida',
    address: 'Av. Fernando Corrêa da Costa, 1200 - Centro',
    neighborhood: 'Centro',
    latitude: -16.4707, longitude: -54.6357, collectedHoursAgo: 2,
    prices: { ETANOL: 3.89, GASOLINA_COMUM: 5.79, GASOLINA_ADITIVADA: 5.99, DIESEL_S10: 5.99 },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000002',
    name: 'Auto Posto Vila Aurora',
    address: 'Av. Bandeirantes, 800 - Vila Aurora',
    neighborhood: 'Vila Aurora',
    latitude: -16.4592, longitude: -54.6301, collectedHoursAgo: 5,
    prices: { ETANOL: 3.79, GASOLINA_COMUM: 5.69, DIESEL_COMUM: 5.89, DIESEL_S10: 5.95 },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000003',
    name: 'Posto Jardim Tropical',
    address: 'R. Rio Branco, 55 - Jardim Tropical',
    neighborhood: 'Jardim Tropical',
    latitude: -16.4801, longitude: -54.6449, collectedHoursAgo: 10,
    prices: { ETANOL: 3.95, GASOLINA_COMUM: 5.85, GASOLINA_ADITIVADA: 6.05, GNV: 4.19 },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000004',
    name: 'Posto Rodoviária BR-364',
    address: 'BR-364, Km 12 - Distrito Industrial',
    neighborhood: 'Distrito Industrial',
    latitude: -16.4419, longitude: -54.6102, collectedHoursAgo: 20,
    prices: { GASOLINA_COMUM: 5.72, DIESEL_COMUM: 5.79, DIESEL_S10: 5.85, ETANOL: 3.85 },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000005',
    name: 'Posto Cidade Alta',
    address: 'Av. Lions Internacional, 2300 - Cidade Alta',
    neighborhood: 'Cidade Alta',
    latitude: -16.4885, longitude: -54.6218, collectedHoursAgo: 30,
    prices: { ETANOL: 3.99, GASOLINA_COMUM: 5.89, GASOLINA_ADITIVADA: 6.09 },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000006',
    name: 'Auto Posto Sagrada Família',
    address: 'R. Barão do Rio Branco, 900 - Sagrada Família',
    neighborhood: 'Sagrada Família',
    latitude: -16.465, longitude: -54.65, collectedHoursAgo: 48,
    prices: { ETANOL: 3.92, GASOLINA_COMUM: 5.82, DIESEL_S10: 5.92 },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000007',
    name: 'Posto Parque das Águas',
    address: 'Av. dos Estudantes, 400 - Parque das Águas',
    neighborhood: 'Parque das Águas',
    latitude: -16.499, longitude: -54.638, collectedHoursAgo: 80,
    prices: { GASOLINA_COMUM: 5.99, ETANOL: 4.05, DIESEL_S10: 6.09 },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000008',
    name: 'Posto Vila Operária',
    address: 'R. Dom Pedro II, 150 - Vila Operária',
    neighborhood: 'Vila Operária',
    latitude: -16.456, longitude: -54.642, collectedHoursAgo: 3,
    prices: { ETANOL: 3.83, GASOLINA_COMUM: 5.75, GASOLINA_ADITIVADA: 5.95, DIESEL_COMUM: 5.84, GNV: 4.09 },
  },
];

/** Centro de Rondonópolis — origem padrão quando não há geolocalização. */
export const DEFAULT_ORIGIN = { latitude: -16.4707, longitude: -54.6357 };

const productByCode = new Map(PRODUCTS.map((p) => [p.code, p]));

function priceOf(station: SeedStation, code: string, now: Date): PublicPrice | null {
  const value = station.prices[code];
  const product = productByCode.get(code);
  if (value === undefined || product === undefined) return null;

  const collectedAt = new Date(now.getTime() - station.collectedHoursAgo * 3600_000);
  const ageMinutes = ageMinutesFrom(collectedAt, now);
  // O seed grava confidence alto para dados demonstrativos.
  return {
    productCode: product.code,
    productName: product.name,
    price: value,
    currency: 'BRL',
    unit: product.unit,
    observedAt: collectedAt.toISOString(),
    observedAtEstimated: false,
    collectedAt: collectedAt.toISOString(),
    ageMinutes,
    freshness: classifyFreshness(ageMinutes, THRESHOLDS),
    confidence: classifyConfidence(0.9),
  };
}

function toSummary(
  station: SeedStation,
  query: StationQuery,
  now: Date,
): PublicStationSummary {
  const codes = query.product ? [query.product] : Object.keys(station.prices);
  const prices = codes
    .map((code) => priceOf(station, code, now))
    .filter((p): p is PublicPrice => p !== null)
    .sort((a, b) => a.price - b.price);

  const origin =
    query.latitude !== undefined && query.longitude !== undefined
      ? { latitude: query.latitude, longitude: query.longitude }
      : null;

  const distanceKm = origin
    ? Math.round(
        haversineKm(origin, { latitude: station.latitude, longitude: station.longitude }) * 100,
      ) / 100
    : null;

  return {
    id: station.id,
    name: station.name,
    address: station.address,
    neighborhood: station.neighborhood,
    municipality: MUNICIPALITY,
    state: STATE,
    latitude: station.latitude,
    longitude: station.longitude,
    distanceKm,
    isDemo: true,
    lowestPrice: prices[0] ?? null,
    prices,
  };
}

function sortStations(
  stations: PublicStationSummary[],
  sort: StationQuery['sort'],
): PublicStationSummary[] {
  const list = [...stations];
  switch (sort) {
    case 'nearest':
      return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    case 'most_recent':
      return list.sort(
        (a, b) => (a.lowestPrice?.ageMinutes ?? Infinity) - (b.lowestPrice?.ageMinutes ?? Infinity),
      );
    case 'best_savings':
    case 'lowest_price':
    default:
      return list.sort(
        (a, b) => (a.lowestPrice?.price ?? Infinity) - (b.lowestPrice?.price ?? Infinity),
      );
  }
}

export function mockConfig(): PublicConfig {
  return {
    environment: 'demo',
    demoMode: true,
    source: SOURCE_NAME,
    freshnessThresholdsHours: {
      recent: THRESHOLDS.recentHours,
      moderate: THRESHOLDS.moderateHours,
      old: THRESHOLDS.oldHours,
    },
    maxPageSize: 50,
    maxRadiusKm: 50,
    defaultMunicipality: MUNICIPALITY,
    defaultState: STATE,
    notices: NOTICES,
    // Sem API, a recarga elétrica fica visível para demonstrar a tela; com API
    // real, quem manda é a flag do backend (hoje FEATURE_CHARGING_STATIONS=false).
    features: { chargingStations: true },
  };
}

export function mockProducts(): Product[] {
  return PRODUCTS.filter((p) => SEED.some((s) => s.prices[p.code] !== undefined));
}

export function mockMunicipalities(): Municipality[] {
  return [{ municipality: MUNICIPALITY, state: STATE, stationCount: SEED.length }];
}

export function mockStations(query: StationQuery): Paginated<PublicStationSummary> {
  const now = new Date();
  let list = SEED.map((s) => toSummary(s, query, now)).filter(
    (s) => s.prices.length > 0,
  );

  if (query.radiusKm !== undefined) {
    list = list.filter((s) => s.distanceKm !== null && s.distanceKm <= query.radiusKm!);
  }
  if (query.minPrice !== undefined) {
    list = list.filter((s) => (s.lowestPrice?.price ?? 0) >= query.minPrice!);
  }
  if (query.maxPrice !== undefined) {
    list = list.filter((s) => (s.lowestPrice?.price ?? Infinity) <= query.maxPrice!);
  }
  if (query.updatedWithinHours !== undefined) {
    list = list.filter(
      (s) => (s.lowestPrice?.ageMinutes ?? Infinity) <= query.updatedWithinHours! * 60,
    );
  }
  if (query.search) {
    const term = query.search.toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.address.toLowerCase().includes(term) ||
        (s.neighborhood?.toLowerCase().includes(term) ?? false),
    );
  }

  list = sortStations(list, query.sort);

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const start = (page - 1) * limit;
  const pageItems = list.slice(start, start + limit);

  return {
    data: pageItems,
    page,
    limit,
    total: list.length,
    hasNextPage: start + limit < list.length,
  };
}

export function mockStation(id: string): PublicStationDetail | null {
  const seed = SEED.find((s) => s.id === id);
  if (!seed) return null;
  const summary = toSummary(seed, {}, new Date());
  return {
    ...summary,
    postalCode: null,
    source: SOURCE_NAME,
    notices: NOTICES,
  };
}

export function mockStationPrices(id: string): PublicPrice[] {
  const seed = SEED.find((s) => s.id === id);
  if (!seed) return [];
  return toSummary(seed, {}, new Date()).prices;
}

/**
 * Histórico sintético e determinístico: oscila em torno do preço atual com uma
 * onda suave, para a tela de histórico ter forma sem inventar tendência.
 */
export function mockHistory(
  stationId: string,
  productCode: string,
  windowDays: number,
): PriceHistory | null {
  const seed = SEED.find((s) => s.id === stationId);
  const current = seed?.prices[productCode];
  if (!seed || current === undefined) return null;

  const points: PricePoint[] = [];
  const today = new Date();
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 86_400_000);
    const wave = Math.sin(i / 3.1) * 0.06 + Math.cos(i / 7.3) * 0.03;
    const avg = round2(current + wave);
    points.push({
      date: date.toISOString().slice(0, 10),
      min: round2(avg - 0.04),
      max: round2(avg + 0.04),
      avg,
      count: 1,
    });
  }

  const avgs = points.map((p) => p.avg);
  const first = avgs[0] ?? current;
  const last = avgs[avgs.length - 1] ?? current;
  const delta = last - first;

  const municipal = SEED.map((s) => s.prices[productCode]).filter(
    (v): v is number => v !== undefined,
  );

  return {
    stationId,
    productCode,
    windowDays,
    points,
    min: Math.min(...points.map((p) => p.min)),
    max: Math.max(...points.map((p) => p.max)),
    avg: round2(avgs.reduce((a, b) => a + b, 0) / avgs.length),
    trend: Math.abs(delta) < 0.02 ? 'STABLE' : delta > 0 ? 'UP' : 'DOWN',
    municipalAvg: municipal.length
      ? round2(municipal.reduce((a, b) => a + b, 0) / municipal.length)
      : null,
    municipalMin: municipal.length ? Math.min(...municipal) : null,
  };
}

export function mockSummary(productCode?: string): PriceSummary[] {
  const now = new Date();
  const codes = productCode ? [productCode] : mockProducts().map((p) => p.code);

  return codes.flatMap((code) => {
    const values = SEED.map((s) => s.prices[code]).filter((v): v is number => v !== undefined);
    const product = productByCode.get(code);
    if (values.length === 0 || !product) return [];
    return [{
      productCode: code,
      productName: product.name,
      municipality: MUNICIPALITY,
      state: STATE,
      min: Math.min(...values),
      avg: round2(values.reduce((a, b) => a + b, 0) / values.length),
      max: Math.max(...values),
      stationCount: values.length,
      collectedAt: now.toISOString(),
    }];
  });
}

export function mockCompare(input: CompareInput): CompareResult {
  const now = new Date();
  const origin =
    input.originLatitude !== undefined && input.originLongitude !== undefined
      ? { latitude: input.originLatitude, longitude: input.originLongitude }
      : null;

  const candidates: CompareCandidate[] = input.stationIds.flatMap((id) => {
    const seed = SEED.find((s) => s.id === id);
    const price = seed?.prices[input.productCode];
    if (!seed || price === undefined) return [];
    const p = priceOf(seed, input.productCode, now);
    return [{
      stationId: seed.id,
      stationName: seed.name,
      pricePerLiter: price,
      distanceKm: origin
        ? Math.round(
            haversineKm(origin, { latitude: seed.latitude, longitude: seed.longitude }) * 100,
          ) / 100
        : null,
      freshness: p?.freshness ?? 'EXPIRED',
    }];
  });

  return computeComparison(input.productCode, candidates, {
    desiredLiters: input.desiredLiters,
    amountToSpend: input.amountToSpend,
    vehicleConsumptionKmPerLiter: input.vehicleConsumptionKmPerLiter,
  });
}

/**
 * Pontos de recarga elétrica. Ainda não existem na API (a rota virá com a flag
 * FEATURE_CHARGING_STATIONS), então o tipo é local ao cliente.
 */
export function mockChargingPoints(origin = DEFAULT_ORIGIN): ChargingPoint[] {
  const raw: Omit<ChargingPoint, 'distanceKm'>[] = [
    {
      id: 'ev-0001', name: 'Shopping Rondon — Estacionamento G1',
      address: 'Av. Frei Servácio, 1000 - Jardim Bandeirantes',
      network: 'Rede EletroPosto', latitude: -16.4672, longitude: -54.6389,
      connectors: [
        { type: 'CCS2', powerKw: 150, available: 2, total: 2 },
        { type: 'Type 2', powerKw: 22, available: 0, total: 1 },
      ],
    },
    {
      id: 'ev-0002', name: 'Posto Centro Avenida — Ponto elétrico',
      address: 'Av. Fernando Corrêa da Costa, 1200 - Centro',
      network: 'Rede EletroPosto', latitude: -16.4707, longitude: -54.6357,
      connectors: [{ type: 'CCS2', powerKw: 50, available: 1, total: 2 }],
    },
    {
      id: 'ev-0003', name: 'Hotel Rota do Sol',
      address: 'BR-163, Km 8 - Distrito Industrial',
      network: 'Carga Livre', latitude: -16.4451, longitude: -54.6155,
      connectors: [
        { type: 'CCS2', powerKw: 90, available: 1, total: 1 },
        { type: 'Type 2', powerKw: 11, available: 2, total: 2 },
      ],
    },
  ];

  return raw
    .map((p) => ({
      ...p,
      distanceKm:
        Math.round(
          haversineKm(origin, { latitude: p.latitude, longitude: p.longitude }) * 100,
        ) / 100,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
