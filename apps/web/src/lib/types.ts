import type { StationSort } from '@posto-barato/shared-types';

/** Parâmetros de `GET /api/v1/stations` (docs/api/endpoints.md). */
export interface StationQuery {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  municipality?: string;
  state?: string;
  product?: string;
  minPrice?: number;
  maxPrice?: number;
  updatedWithinHours?: number;
  sort?: StationSort;
  page?: number;
  limit?: number;
  /** Filtro textual aplicado no cliente (a API ainda não expõe busca livre). */
  search?: string;
}

export interface ChargingConnector {
  type: 'CCS2' | 'Type 2' | 'CHAdeMO';
  powerKw: number;
  available: number;
  total: number;
}

/**
 * Ponto de recarga elétrica. Ainda não faz parte de `@posto-barato/shared-types`
 * porque a API não expõe a rota (virá junto com FEATURE_CHARGING_STATIONS);
 * quando expuser, este tipo migra para o pacote compartilhado.
 */
export interface ChargingPoint {
  id: string;
  name: string;
  address: string;
  network: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  connectors: ChargingConnector[];
}

/** Veículo do usuário, hoje mantido só no dispositivo (localStorage). */
export interface Vehicle {
  id: string;
  nickname: string;
  kind: 'combustion' | 'electric';
  detail: string;
  /** km/l para combustão, km/kWh para elétrico. */
  consumption: number;
  tankOrBattery: number;
  preferredProduct: string;
}
