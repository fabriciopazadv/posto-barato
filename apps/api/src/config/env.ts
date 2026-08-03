import { z } from 'zod';

/**
 * Validação de ambiente (seção 36). Falha rápido se algo essencial faltar.
 * Nenhum segredo é logado.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_HOST: z.string().default('0.0.0.0'),

  // Conexões separadas por privilégio (ver packages/database/src/clients.ts).
  // Nenhuma é obrigatória isoladamente: fora de produção `DATABASE_URL` cobre as
  // duas. Em produção cada uma é exigida — a checagem está no superRefine abaixo,
  // porque depende do NODE_ENV.
  //
  // A API não recebe `DATABASE_MIGRATION_URL`: quem migra é o comando de
  // migração, e um processo que atende a internet não tem por que carregar uma
  // credencial capaz de alterar schema.
  DATABASE_READONLY_URL: z.string().min(1).optional(),
  DATABASE_APP_URL: z.string().min(1).optional(),
  /** Conexão única de desenvolvimento. Ignorada em produção. */
  DATABASE_URL: z.string().min(1).optional(),

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

  // Assinatura do Premium via Asaas (API de Assinaturas, recorrente).
  // Preços em reais, sobrescritíveis sem deploy. Os padrões vivem em
  // @posto-barato/domain (PRECOS_PADRAO) — aqui só a sobrescrita opcional.
  ASAAS_VALUE_MENSAL: z.coerce.number().positive().optional(),
  ASAAS_VALUE_SEMESTRAL: z.coerce.number().positive().optional(),
  ASAAS_VALUE_ANUAL: z.coerce.number().positive().optional(),
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  // Segredo exigido por POST /billing/cron (virada do teste + reconciliação).
  CRON_SECRET: z.string().optional(),
})
  .superRefine((env, ctx) => {
    // Em produção, cair em uma conexão genérica é como uma API pública acaba
    // conectada com um usuário que pode escrever no coletor. Falha no boot.
    const required =
      env.NODE_ENV === 'production'
        ? (['DATABASE_READONLY_URL', 'DATABASE_APP_URL'] as const)
        : ([] as const);

    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'obrigatória em produção — DATABASE_URL não substitui.',
        });
      }
    }

    if (env.NODE_ENV !== 'production') {
      const hasAny = env.DATABASE_URL ?? env.DATABASE_READONLY_URL ?? env.DATABASE_APP_URL;
      if (!hasAny) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'defina DATABASE_URL (ou as URLs por papel) para conectar ao banco.',
        });
      }
    }
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
