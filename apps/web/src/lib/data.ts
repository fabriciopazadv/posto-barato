/**
 * Fachada de dados do app.
 *
 * Toda tela consome daqui e nunca chama `fetch` direto. Com
 * `NEXT_PUBLIC_API_URL` definida, as chamadas vão para a API pública
 * `/api/v1`; sem ela, a camada de demonstração responde. As telas não sabem a
 * diferença — só leem `usingMock` quando precisam avisar o usuário.
 */
import type {
  CancelSubscriptionResponse,
  CompareInput,
  CompareResult,
  ListResponse,
  Municipality,
  Paginated,
  PriceHistory,
  PriceSummary,
  Product,
  PublicConfig,
  PublicPrice,
  PublicStationDetail,
  PublicStationSummary,
  PlansResponse,
  StationPricesResponse,
  SubscribeResponse,
  SubscriptionPlan,
  SubscriptionSummary,
} from '@posto-barato/shared-types';
import { CARENCIA_HORAS, TRIAL_DIAS, listarPlanos } from '@posto-barato/domain';

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

/**
 * As rotas de lista da API respondem em envelope `{ data: [...] }` — o mesmo
 * formato do campo `data` de `Paginated`, usado por `/stations`. O app
 * desembrulha aqui, num lugar só, para que nenhuma tela precise saber disso.
 * O envelope é tipado em `@posto-barato/shared-types`, então API e app não têm
 * como divergir em silêncio de novo.
 */
export async function getProducts(): Promise<Product[]> {
  if (USING_MOCK) return mock.mockProducts();
  const { data } = await apiFetch<ListResponse<Product>>('/api/v1/products');
  return data;
}

export async function getMunicipalities(): Promise<Municipality[]> {
  if (USING_MOCK) return mock.mockMunicipalities();
  const { data } = await apiFetch<ListResponse<Municipality>>('/api/v1/municipalities');
  return data;
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
  const response = await apiFetch<StationPricesResponse>(
    `/api/v1/stations/${encodeURIComponent(id)}/prices`,
  );
  return response.prices;
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
  const { data } = await apiFetch<ListResponse<PriceSummary>>(
    `/api/v1/prices/summary${buildQuery({ municipality, state, product: productCode })}`,
  );
  return data;
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

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/**
 * Planos e parâmetros do ciclo. É rota pública na API — a tela nunca anuncia
 * preço próprio. Sem API, os mesmos valores vêm de `@posto-barato/domain`, que
 * é a fonte que o servidor também usa.
 */
export async function getPlans(): Promise<PlansResponse> {
  if (USING_MOCK) {
    return { planos: listarPlanos(), trialDias: TRIAL_DIAS, carenciaHoras: CARENCIA_HORAS };
  }
  return apiFetch<PlansResponse>('/api/v1/billing/planos');
}

/**
 * Estado da assinatura da conta. Sem API não há conta, então não há assinatura
 * — a tela mostra os planos e explica que assinar depende do login.
 */
export async function getSubscription(): Promise<SubscriptionSummary | null> {
  if (USING_MOCK) return null;
  try {
    return await apiFetch<SubscriptionSummary>('/api/v1/billing/subscription');
  } catch (error) {
    if (
      error instanceof PostoBaratoApiError &&
      (error.code === 'UNAUTHORIZED' || error.code === 'NOT_FOUND')
    ) {
      return null;
    }
    throw error;
  }
}

export async function subscribe(
  plano: SubscriptionPlan,
  cpfCnpj?: string,
): Promise<SubscribeResponse> {
  return apiFetch<SubscribeResponse>('/api/v1/billing/subscription', {
    method: 'POST',
    body: JSON.stringify({ plano, cpfCnpj }),
  });
}

export async function cancelSubscription(): Promise<CancelSubscriptionResponse> {
  return apiFetch<CancelSubscriptionResponse>('/api/v1/billing/subscription', {
    method: 'DELETE',
  });
}

export const NOTICES = mock.NOTICES;
export const DEFAULT_ORIGIN = mock.DEFAULT_ORIGIN;
