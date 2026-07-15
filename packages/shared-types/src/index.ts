/**
 * Contratos públicos compartilhados entre a API do Posto Barato e seus clientes
 * (mobile/web). Nenhum campo interno do coletor é representado aqui — apenas o
 * modelo público derivado descrito na seção 8 da especificação da Fase 2.
 */

/** Classificação de frescor do preço (limites configuráveis via env). */
export type PriceFreshness = 'RECENT' | 'MODERATE' | 'OLD' | 'EXPIRED';

/** Nível de confiança derivado do confidence_score da observação. */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/** Categorias de produto conhecidas (derivadas de products.category). */
export type ProductCategory = 'FUEL' | 'OTHER';

export interface Product {
  code: string;
  name: string;
  category: ProductCategory;
  unit: string;
}

export interface Municipality {
  municipality: string;
  state: string;
  stationCount: number;
}

/** Preço público de um produto em um posto (observação válida mais recente). */
export interface PublicPrice {
  productCode: string;
  productName: string;
  price: number;
  currency: string;
  unit: string;
  /** Data estimada da observação, quando disponível. */
  observedAt: string | null;
  /** Se observedAt é uma estimativa (a partir de texto relativo). */
  observedAtEstimated: boolean;
  /** Data em que o dado foi coletado para o Banco de Dados Posto Barato. */
  collectedAt: string;
  /** Minutos decorridos desde collectedAt no momento da resposta. */
  ageMinutes: number;
  freshness: PriceFreshness;
  confidence: ConfidenceLevel;
}

export interface PublicStationSummary {
  id: string;
  name: string;
  address: string;
  neighborhood: string | null;
  municipality: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  /** Distância em km a partir da origem informada na consulta, quando houver. */
  distanceKm: number | null;
  isDemo: boolean;
  /** Menor preço entre os produtos consultados, para ordenação/exibição. */
  lowestPrice: PublicPrice | null;
  prices: PublicPrice[];
}

export interface PublicStationDetail extends PublicStationSummary {
  postalCode: string | null;
  /** Sempre "Banco de Dados Posto Barato" — nunca a fonte interna. */
  source: string;
  notices: string[];
}

export interface PricePoint {
  date: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export type PriceTrend = 'UP' | 'DOWN' | 'STABLE';

export interface PriceHistory {
  stationId: string;
  productCode: string;
  windowDays: number;
  points: PricePoint[];
  min: number | null;
  max: number | null;
  avg: number | null;
  trend: PriceTrend;
  municipalAvg: number | null;
  municipalMin: number | null;
}

export interface PriceSummary {
  productCode: string;
  productName: string;
  municipality: string;
  state: string;
  min: number;
  avg: number;
  max: number;
  stationCount: number;
  collectedAt: string;
}

export interface CompareInput {
  stationIds: string[];
  productCode: string;
  originLatitude?: number;
  originLongitude?: number;
  desiredLiters?: number;
  amountToSpend?: number;
  vehicleConsumptionKmPerLiter?: number;
}

export interface CompareOption {
  stationId: string;
  stationName: string;
  pricePerLiter: number;
  distanceKm: number | null;
  /** Custo estimado do deslocamento até o posto (ida), quando calculável. */
  travelCost: number | null;
  liters: number;
  fuelCost: number;
  /** Economia líquida vs. a opção mais cara, já descontado o deslocamento. */
  netSavings: number;
  savingsPercent: number;
  freshness: PriceFreshness;
  isBestOption: boolean;
}

export interface CompareResult {
  productCode: string;
  options: CompareOption[];
  bestOptionStationId: string | null;
  notice: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
}

export interface PublicConfig {
  environment: string;
  demoMode: boolean;
  source: string;
  freshnessThresholdsHours: {
    recent: number;
    moderate: number;
    old: number;
  };
  maxPageSize: number;
  maxRadiusKm: number;
  defaultMunicipality: string;
  defaultState: string;
  notices: string[];
  features: Record<string, boolean>;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export const STATION_SORTS = [
  'lowest_price',
  'nearest',
  'best_savings',
  'most_recent',
] as const;
export type StationSort = (typeof STATION_SORTS)[number];
