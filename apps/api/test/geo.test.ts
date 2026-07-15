import { describe, expect, it } from 'vitest';
import { haversineKm, isValidLatitude, isValidLongitude } from '../src/domain/geo.js';

describe('haversineKm', () => {
  it('retorna 0 para o mesmo ponto', () => {
    const p = { latitude: -16.47, longitude: -54.63 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });

  it('calcula distância em linha reta (Rondonópolis → Cuiabá ~ 183 km)', () => {
    // Distância geodésica (great-circle); por estrada são ~210 km.
    const rondonopolis = { latitude: -16.4673, longitude: -54.6372 };
    const cuiaba = { latitude: -15.6014, longitude: -56.0979 };
    const d = haversineKm(rondonopolis, cuiaba);
    expect(d).toBeGreaterThan(175);
    expect(d).toBeLessThan(195);
  });
});

describe('validadores', () => {
  it('valida latitude e longitude', () => {
    expect(isValidLatitude(-16.47)).toBe(true);
    expect(isValidLatitude(-91)).toBe(false);
    expect(isValidLongitude(-54.63)).toBe(true);
    expect(isValidLongitude(181)).toBe(false);
  });
});
