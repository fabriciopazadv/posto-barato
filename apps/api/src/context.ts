import type { Env } from './config/env.js';
import type { FreshnessThresholds } from './domain/freshness.js';

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
}

export function buildContext(env: Env): AppContext {
  return {
    env,
    thresholds: {
      recentHours: env.FRESHNESS_RECENT_HOURS,
      moderateHours: env.FRESHNESS_MODERATE_HOURS,
      oldHours: env.FRESHNESS_OLD_HOURS,
    },
    auth: {
      accessSecret: env.AUTH_ACCESS_SECRET,
      accessTtlSeconds: env.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlDays: env.AUTH_REFRESH_TOKEN_TTL_DAYS,
      cookieSecure: env.COOKIE_SECURE,
    },
  };
}
