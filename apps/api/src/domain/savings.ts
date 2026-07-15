import type { CompareOption, CompareResult, PriceFreshness } from '@posto-barato/shared-types';

export const DEFAULT_LITERS = 40;
export const COMPARE_NOTICE =
  'Cálculo estimado. Consumo, trânsito e preços podem variar.';

export interface CompareCandidate {
  stationId: string;
  stationName: string;
  pricePerLiter: number;
  distanceKm: number | null;
  freshness: PriceFreshness;
}

export interface CompareParams {
  desiredLiters?: number;
  amountToSpend?: number;
  vehicleConsumptionKmPerLiter?: number;
}

/**
 * Comparação de economia real (seção 12).
 *
 * Fórmula (documentada em docs/product/calculo-economia.md):
 *   litros        = desiredLiters ?? (amountToSpend / maiorPreço) ?? DEFAULT_LITERS
 *   custoAbast_i  = litros * preço_i
 *   custoDesloc_i = (2 * distânciaKm_i / consumo) * preço_i   (ida e volta)
 *   custoTotal_i  = custoAbast_i + custoDesloc_i
 *   baseline      = maior custoAbast entre as opções (sem deslocamento)
 *   economiaLíq_i = baseline - custoTotal_i
 *   melhorOpção   = menor custoTotal_i
 *
 * O deslocamento só entra quando há distância e consumo; caso contrário, a
 * comparação considera apenas o preço do combustível.
 */
export function computeComparison(
  productCode: string,
  candidates: CompareCandidate[],
  params: CompareParams,
): CompareResult {
  if (candidates.length === 0) {
    return { productCode, options: [], bestOptionStationId: null, notice: COMPARE_NOTICE };
  }

  const maxPrice = Math.max(...candidates.map((c) => c.pricePerLiter));
  const liters =
    params.desiredLiters ??
    (params.amountToSpend ? params.amountToSpend / maxPrice : DEFAULT_LITERS);

  const consumption = params.vehicleConsumptionKmPerLiter;

  const computed = candidates.map((c) => {
    const fuelCost = round2(liters * c.pricePerLiter);
    let travelCost: number | null = null;
    if (c.distanceKm !== null && consumption && consumption > 0) {
      travelCost = round2((2 * c.distanceKm / consumption) * c.pricePerLiter);
    }
    const totalCost = fuelCost + (travelCost ?? 0);
    return { candidate: c, fuelCost, travelCost, totalCost };
  });

  const baseline = Math.max(...computed.map((c) => c.fuelCost));
  const bestTotal = Math.min(...computed.map((c) => c.totalCost));

  const options: CompareOption[] = computed.map((c) => {
    const netSavings = round2(baseline - c.totalCost);
    return {
      stationId: c.candidate.stationId,
      stationName: c.candidate.stationName,
      pricePerLiter: c.candidate.pricePerLiter,
      distanceKm: c.candidate.distanceKm,
      travelCost: c.travelCost,
      liters: round2(liters),
      fuelCost: c.fuelCost,
      netSavings,
      savingsPercent: baseline > 0 ? round2((netSavings / baseline) * 100) : 0,
      freshness: c.candidate.freshness,
      isBestOption: c.totalCost === bestTotal,
    };
  });

  const best = computed.find((c) => c.totalCost === bestTotal);
  return {
    productCode,
    options,
    bestOptionStationId: best ? best.candidate.stationId : null,
    notice: COMPARE_NOTICE,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
