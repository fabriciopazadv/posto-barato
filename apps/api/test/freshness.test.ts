import { describe, expect, it } from 'vitest';
import {
  ageMinutesFrom,
  classifyConfidence,
  classifyFreshness,
  humanizeAge,
} from '../src/domain/freshness.js';

const thresholds = { recentHours: 6, moderateHours: 24, oldHours: 72 };

describe('classifyFreshness', () => {
  it('classifica pelas faixas configuráveis', () => {
    expect(classifyFreshness(0, thresholds)).toBe('RECENT');
    expect(classifyFreshness(6 * 60, thresholds)).toBe('RECENT');
    expect(classifyFreshness(6 * 60 + 1, thresholds)).toBe('MODERATE');
    expect(classifyFreshness(24 * 60, thresholds)).toBe('MODERATE');
    expect(classifyFreshness(24 * 60 + 1, thresholds)).toBe('OLD');
    expect(classifyFreshness(72 * 60, thresholds)).toBe('OLD');
    expect(classifyFreshness(72 * 60 + 1, thresholds)).toBe('EXPIRED');
  });
});

describe('classifyConfidence', () => {
  it('mapeia score para nível', () => {
    expect(classifyConfidence(1)).toBe('HIGH');
    expect(classifyConfidence(0.85)).toBe('HIGH');
    expect(classifyConfidence(0.7)).toBe('MEDIUM');
    expect(classifyConfidence(0.5)).toBe('LOW');
  });
});

describe('ageMinutesFrom', () => {
  it('calcula idade em minutos e nunca é negativa', () => {
    const now = new Date('2026-07-14T12:00:00Z');
    expect(ageMinutesFrom(new Date('2026-07-14T11:00:00Z'), now)).toBe(60);
    expect(ageMinutesFrom(new Date('2026-07-14T13:00:00Z'), now)).toBe(0);
  });
});

describe('humanizeAge', () => {
  it('formata em PT-BR', () => {
    expect(humanizeAge(0)).toBe('agora há pouco');
    expect(humanizeAge(30)).toBe('há 30 min');
    expect(humanizeAge(180)).toBe('há 3 h');
    expect(humanizeAge(60 * 48)).toBe('há 2 d');
  });
});
