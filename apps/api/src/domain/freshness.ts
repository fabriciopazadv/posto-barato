import type { ConfidenceLevel, PriceFreshness } from '@posto-barato/shared-types';

export interface FreshnessThresholds {
  recentHours: number;
  moderateHours: number;
  oldHours: number;
}

/**
 * Classifica o frescor de um preço a partir da idade em minutos (seção 8).
 * RECENT ≤ recent < MODERATE ≤ moderate < OLD ≤ old < EXPIRED.
 */
export function classifyFreshness(
  ageMinutes: number,
  thresholds: FreshnessThresholds,
): PriceFreshness {
  const ageHours = ageMinutes / 60;
  if (ageHours <= thresholds.recentHours) return 'RECENT';
  if (ageHours <= thresholds.moderateHours) return 'MODERATE';
  if (ageHours <= thresholds.oldHours) return 'OLD';
  return 'EXPIRED';
}

/** Deriva um nível de confiança legível a partir do confidence_score (0..1). */
export function classifyConfidence(score: number): ConfidenceLevel {
  if (score >= 0.85) return 'HIGH';
  if (score >= 0.6) return 'MEDIUM';
  return 'LOW';
}

/** Idade em minutos entre a coleta e o instante de referência. */
export function ageMinutesFrom(collectedAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - collectedAt.getTime()) / 60000));
}

/**
 * Texto humano relativo (PT-BR) para exibição, ex.: "há 3 horas".
 * Nunca afirma tempo real (seção 2).
 */
export function humanizeAge(ageMinutes: number): string {
  if (ageMinutes < 1) return 'agora há pouco';
  if (ageMinutes < 60) return `há ${ageMinutes} min`;
  const hours = Math.round(ageMinutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}
