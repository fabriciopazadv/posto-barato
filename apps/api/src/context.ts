import type { Env } from './config/env.js';
import type { FreshnessThresholds, TabelaPrecos } from '@posto-barato/domain';

export interface AuthConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  cookieSecure: boolean;
}

export interface AppContext {
  env: Env;
  thresholds: FreshnessThresholds;
  auth: AuthConfig;
  /** Preços vigentes em centavos; vazio usa os padrões do domínio. */
  precos: TabelaPrecos;
}

export function buildContext(env: Env): AppContext {
  return {
    env,
    thresholds: {
      recentHours: env.FRESHNESS_RECENT_HOURS,
      moderateHours: env.FRESHNESS_MODERATE_HOURS,
      oldHours: env.FRESHNESS_OLD_HOURS,
    },
    precos: buildPrecos(env),
    auth: {
      accessSecret: env.AUTH_ACCESS_SECRET,
      accessTtlSeconds: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlDays: env.AUTH_REFRESH_TOKEN_TTL_DAYS,
      cookieSecure: env.COOKIE_SECURE,
    },
  };
}

/**
 * Sobrescrita de preço por env, em reais → centavos. Só entram os planos
 * efetivamente configurados; os demais caem nos padrões de `@posto-barato/domain`.
 */
function buildPrecos(env: Env): TabelaPrecos {
  const precos: TabelaPrecos = {};
  if (env.ASAAS_VALUE_MENSAL !== undefined) {
    precos.MENSAL = Math.round(env.ASAAS_VALUE_MENSAL * 100);
  }
  if (env.ASAAS_VALUE_SEMESTRAL !== undefined) {
    precos.SEMESTRAL = Math.round(env.ASAAS_VALUE_SEMESTRAL * 100);
  }
  if (env.ASAAS_VALUE_ANUAL !== undefined) {
    precos.ANUAL = Math.round(env.ASAAS_VALUE_ANUAL * 100);
  }
  return precos;
}
