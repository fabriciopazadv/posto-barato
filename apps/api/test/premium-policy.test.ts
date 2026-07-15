import { describe, expect, it } from 'vitest';
import { isPremium, PremiumRequiredError, requirePremium } from '../src/domain/premium-policy.js';

describe('isPremium', () => {
  it('é falso quando premiumSince é null', () => {
    expect(isPremium({ premiumSince: null })).toBe(false);
  });

  it('é verdadeiro para qualquer data (vitalício, sem expiração)', () => {
    expect(isPremium({ premiumSince: new Date('2020-01-01') })).toBe(true);
    expect(isPremium({ premiumSince: new Date() })).toBe(true);
  });
});

describe('requirePremium', () => {
  it('lança PremiumRequiredError quando não é premium', () => {
    expect(() => requirePremium({ premiumSince: null })).toThrow(PremiumRequiredError);
  });

  it('não lança quando é premium', () => {
    expect(() => requirePremium({ premiumSince: new Date() })).not.toThrow();
  });
});
