import { describe, expect, it } from 'vitest';
import { computeComparison, type CompareCandidate } from '../src/domain/savings.js';

const base: Pick<CompareCandidate, 'freshness'> = { freshness: 'RECENT' };

describe('computeComparison', () => {
  it('sem deslocamento, o mais barato é a melhor opção', () => {
    const candidates: CompareCandidate[] = [
      { stationId: 'a', stationName: 'A', pricePerLiter: 5.8, distanceKm: null, ...base },
      { stationId: 'b', stationName: 'B', pricePerLiter: 5.5, distanceKm: null, ...base },
    ];
    const result = computeComparison('GASOLINA_COMUM', candidates, { desiredLiters: 40 });
    expect(result.bestOptionStationId).toBe('b');
    const best = result.options.find((o) => o.stationId === 'b')!;
    expect(best.fuelCost).toBeCloseTo(220, 2);
    expect(best.netSavings).toBeCloseTo(12, 2); // (5.8-5.5)*40
    expect(best.isBestOption).toBe(true);
  });

  it('o deslocamento pode inverter a decisão', () => {
    const candidates: CompareCandidate[] = [
      { stationId: 'perto', stationName: 'Perto', pricePerLiter: 5.7, distanceKm: 0.5, ...base },
      { stationId: 'longe', stationName: 'Longe', pricePerLiter: 5.5, distanceKm: 40, ...base },
    ];
    const result = computeComparison('GASOLINA_COMUM', candidates, {
      desiredLiters: 40,
      vehicleConsumptionKmPerLiter: 10,
    });
    // O posto distante economiza 8 no combustível, mas gasta ~44 indo e voltando.
    expect(result.bestOptionStationId).toBe('perto');
    const longe = result.options.find((o) => o.stationId === 'longe')!;
    expect(longe.travelCost).toBeCloseTo(44, 0); // (2*40/10)*5.5
  });

  it('normaliza por valor a gastar quando não há litros', () => {
    const candidates: CompareCandidate[] = [
      { stationId: 'a', stationName: 'A', pricePerLiter: 5.0, distanceKm: null, ...base },
      { stationId: 'b', stationName: 'B', pricePerLiter: 4.0, distanceKm: null, ...base },
    ];
    const result = computeComparison('ETANOL', candidates, { amountToSpend: 100 });
    // litros = 100 / maiorPreço(5) = 20; custo em B = 20*4 = 80
    const b = result.options.find((o) => o.stationId === 'b')!;
    expect(b.liters).toBeCloseTo(20, 2);
    expect(b.fuelCost).toBeCloseTo(80, 2);
  });

  it('lista vazia não quebra', () => {
    const result = computeComparison('ETANOL', [], {});
    expect(result.options).toHaveLength(0);
    expect(result.bestOptionStationId).toBeNull();
    expect(result.notice).toContain('estimado');
  });
});
