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

  // Autenticação (seção 14). Segredos sem default — falha rápido se ausentes.
  AUTH_ACCESS_SECRET: z.string().min(32, 'AUTH_ACCESS_SECRET deve ter ao menos 32 caracteres'),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // URL pública da API/app, usada nos callbacks de checkout (seção 16).
  APP_URL: z.string().url().default('http://localhost:3333'),

  // Premium vitalício — pagamento único via Asaas (chargeType DETACHED).
  PREMIUM_PRICE_CENTS: z.coerce.number().int().positive().default(999),
  PREMIUM_LABEL: z.string().default('Posto Barato Premium (vitalício)'),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
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
