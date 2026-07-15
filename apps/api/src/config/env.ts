import { z } from 'zod';

/**
 * Validação de ambiente (seção 36). Falha rápido se algo essencial faltar.
 * Nenhum segredo é logado.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),

  // Faixas de frescor do preço em horas (seção 8), configuráveis.
  FRESHNESS_RECENT_HOURS: z.coerce.number().positive().default(6),
  FRESHNESS_MODERATE_HOURS: z.coerce.number().positive().default(24),
  FRESHNESS_OLD_HOURS: z.coerce.number().positive().default(72),

  // Limites de consulta (seções 10 e 30).
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(50),
  MAX_RADIUS_KM: z.coerce.number().positive().default(50),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  DEFAULT_MUNICIPALITY: z.string().default('Rondonópolis'),
  DEFAULT_STATE: z.string().default('MT'),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Feature flags (seção 28/36).
  FEATURE_CHARGING_STATIONS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  return parsed.data;
}
