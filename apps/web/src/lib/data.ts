/**
 * Fachada de dados do app.
 *
 * Toda tela consome daqui e nunca chama `fetch` direto. Com
 * `NEXT_PUBLIC_API_URL` definida, as chamadas vão para a API pública
 * `/api/v1`; sem ela, a camada de demonstração responde. As telas não sabem a
 * diferença — só leem `usingMock` quando precisam avisar o usuário.
 */
import type {
  CompareInput,
  CompareResult,
  Municipality,
  Paginated,
  PriceHistory,
  PriceSummary,
  Product,
  PublicConfig,
  PublicPrice,
  PublicStationDetail,
  PublicStationSummary,
} from '@posto-barato/shared-types';

import { USING_MOCK } from './config';
import { apiFetch, buildQuery, PostoBaratoApiError } from './http';
import * as mock from './mock';
import type { ChargingPoint, StationQuery } from './types';

export { PostoBaratoApiError };
export const usingMock = USING_MOCK;

export async function getConfig(): Promise<PublicConfig> {
  if (USING_MOCK) return mock.mockConfig();
  return apiFetch<PublicConfig>('/api/v1/public/config');
}

export async function getProducts(): Promise<Product[]> {
  if (USING_MOCK) return mock.mockProducts();
  return apiFetch<Product[]>('/api/v1/products');
}

export async function getMunicipalities(): Promise<Municipality[]> {
  if (USING_MOCK) return mock.mockMunicipalities();
  return apiFetch<Municipality[]>('/api/v1/municipalities');
}

export async function getStations(
  query: StationQuery = {},
): Promise<Paginated<PublicStationSummary>> {
  if (USING_MOCK) return mock.mockStations(query);

  // `search` é filtro local: a API ainda não tem busca textual livre.
  const { search: _search, ...remote } = query;
  return apiFetch<Paginated<PublicStationSummary>>(
    `/api/v1/stations${buildQuery({ ...remote })}`,
  );
}

export async function getStation(id: string): Promise<PublicStationDetail | null> {
  if (USING_MOCK) return mock.mockStation(id);
  try {
    return await apiFetch<PublicStationDetail>(`/api/v1/stations/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof PostoBaratoApiError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

export async function getStationPrices(id: string): Promise<PublicPrice[]> {
  if (USING_MOCK) return mock.mockStationPrices(id);
  return apiFetch<PublicPrice[]>(`/api/v1/stations/${encodeURIComponent(id)}/prices`);
}

export async function getStationHistory(
  id: string,
  productCode: string,
  windowDays: 7 | 30 | 90 = 30,
): Promise<PriceHistory | null> {
  if (USING_MOCK) return mock.mockHistory(id, productCode, windowDays);
  try {
    return await apiFetch<PriceHistory>(
      `/api/v1/stations/${encodeURIComponent(id)}/history${buildQuery({
        product: productCode,
        windowDays,
      })}`,
    );
  } catch (error) {
    if (error instanceof PostoBaratoApiError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

export async function getPriceSummary(
  municipality: string,
  state: string,
  productCode?: string,
): Promise<PriceSummary[]> {
  if (USING_MOCK) return mock.mockSummary(productCode);
  return apiFetch<PriceSummary[]>(
    `/api/v1/prices/summary${buildQuery({ municipality, state, product: productCode })}`,
  );
}

export async function compareStations(input: CompareInput): Promise<CompareResult> {
  if (USING_MOCK) return mock.mockCompare(input);
  return apiFetch<CompareResult>('/api/v1/prices/compare', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Pontos de recarga. A API ainda não expõe a rota; sem mock, devolve lista
 * vazia para a tela mostrar o estado "em breve" em vez de quebrar.
 */
export async function getChargingPoints(origin?: {
  latitude: number;
  longitude: number;
}): Promise<ChargingPoint[]> {
  if (USING_MOCK) return mock.mockChargingPoints(origin);
  return [];
}

export const NOTICES = mock.NOTICES;
export const DEFAULT_ORIGIN = mock.DEFAULT_ORIGIN;
