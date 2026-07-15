import type { Env } from './config/env.js';
import type { FreshnessThresholds } from './domain/freshness.js';

export interface AppContext {
  env: Env;
  thresholds: FreshnessThresholds;
}

export function buildContext(env: Env): AppContext {
  return {
    env,
    thresholds: {
      recentHours: env.FRESHNESS_RECENT_HOURS,
      moderateHours: env.FRESHNESS_MODERATE_HOURS,
      oldHours: env.FRESHNESS_OLD_HOURS,
    },
  };
}
