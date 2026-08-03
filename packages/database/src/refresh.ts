/**
 * Atualização da projeção pública.
 *
 * A matview é um retrato: sem refresh, o app mostra o preço da última coleta que
 * alguém lembrou de propagar. Este módulo é o mecanismo que a Fase 2 oferece
 * para propagar — e como este repositório não controla o coletor, ele é feito
 * para ser chamado de fora: um comando, sem servidor no meio.
 *
 * NÃO existe rota HTTP de refresh, de propósito. Um webhook público seria mais
 * uma superfície exposta na internet cujo único usuário é um processo que já
 * tem credencial do banco.
 *
 * Duas formas de acionamento, documentadas em docs/operations/database-integration.md:
 *
 *   1. Direto, ao fim de uma coleta bem-sucedida (preferido — o dado aparece
 *      assim que existe):
 *        pnpm --filter @posto-barato/database refresh -- --by=collector
 *
 *   2. Cron periódico, como contingência para o caso de o gatilho da coleta
 *      falhar ou o coletor rodar sem conhecer este repositório:
 *        *\/10 * * * * pnpm --filter @posto-barato/database refresh -- --by=cron
 *
 * As duas convivem: o refresh é idempotente e a concorrência é resolvida por
 * advisory lock dentro de `app.refresh_public_prices()`.
 */
import { Client } from 'pg';
import { redactDatabaseUrl, resolveDatabaseUrl } from './clients.js';

export type RefreshOutcome = 'ok' | 'skipped';

export interface RefreshResult {
  outcome: RefreshOutcome;
  durationMs: number;
  attempts: number;
}

export interface RefreshOptions {
  /** Quem pediu, para o registro: 'cli' | 'cron' | 'collector' | 'seed'. */
  triggeredBy?: string;
  /** Tentativas extras em caso de falha. */
  retries?: number;
  /** Espera inicial entre tentativas, dobrada a cada uma. */
  retryDelayMs?: number;
  /** Conexão alternativa — os testes apontam para o banco descartável. */
  connectionString?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Conexão do refresh. `price_refresher` só tem EXECUTE na função e escrita no
 * próprio registro — nem lê a matview que manda atualizar.
 */
function refreshConnectionString(): string {
  const specific = process.env.DATABASE_REFRESH_URL?.trim();
  if (specific) return specific;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_REFRESH_URL não definida. Em produção o refresh usa a credencial de price_refresher.',
    );
  }
  return resolveDatabaseUrl('migration');
}

async function attemptRefresh(client: Client, triggeredBy: string, attempt: number) {
  const { rows: logRows } = await client.query<{ id: string }>(
    `INSERT INTO app.price_refresh_log (triggered_by, attempt) VALUES ($1, $2) RETURNING id`,
    [triggeredBy, attempt],
  );
  const logId = logRows[0]!.id;
  const startedAt = Date.now();

  try {
    const { rows } = await client.query<{ refreshed: boolean }>(
      'SELECT app.refresh_public_prices() AS refreshed',
    );
    const outcome: RefreshOutcome = rows[0]?.refreshed ? 'ok' : 'skipped';
    const durationMs = Date.now() - startedAt;
    await client.query(
      `UPDATE app.price_refresh_log
         SET finished_at = now(), duration_ms = $2, outcome = $3
       WHERE id = $1`,
      [logId, durationMs, outcome],
    );
    return { outcome, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    // O registro da falha vai em uma instrução própria, e não em transação com o
    // refresh: se compartilhassem transação, o rollback do erro apagaria a única
    // prova de que a tentativa existiu.
    await client
      .query(
        `UPDATE app.price_refresh_log
           SET finished_at = now(), duration_ms = $2, outcome = 'error', error_text = $3
         WHERE id = $1`,
        [logId, durationMs, (err as Error).message],
      )
      .catch(() => {
        // Banco fora do ar: não há onde registrar. O erro original é o que importa.
      });
    throw err;
  }
}

/**
 * Atualiza `app.public_latest_prices`, registrando cada tentativa.
 *
 * Erros de permissão ou de SQL sobem — a versão anterior desta função capturava
 * qualquer exceção e caía num refresh não-concorrente, o que transformava falta
 * de privilégio em "sucesso" aparente.
 */
export async function refreshPublicPrices(options: RefreshOptions = {}): Promise<RefreshResult> {
  const {
    triggeredBy = 'cli',
    retries = 2,
    retryDelayMs = 2000,
    connectionString = refreshConnectionString(),
  } = options;

  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Refresh não conectou em ${redactDatabaseUrl(connectionString)}: ${(err as Error).message}`,
      { cause: err },
    );
  }

  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        const { outcome, durationMs } = await attemptRefresh(client, triggeredBy, attempt);
        return { outcome, durationMs, attempts: attempt };
      } catch (err) {
        lastError = err;
        if (attempt <= retries) {
          const wait = retryDelayMs * 2 ** (attempt - 1);
          console.warn(
            `[refresh] tentativa ${attempt} falhou (${(err as Error).message}); nova tentativa em ${wait} ms.`,
          );
          await delay(wait);
        }
      }
    }
    throw lastError;
  } finally {
    await client.end();
  }
}

function flagValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const retries = Number(flagValue('retries') ?? 2);
  refreshPublicPrices({ triggeredBy: flagValue('by') ?? 'cli', retries })
    .then((result) => {
      if (result.outcome === 'skipped') {
        console.log('[refresh] outro refresh já estava em curso; nada a fazer.');
      } else {
        console.log(
          `[refresh] app.public_latest_prices atualizada em ${result.durationMs} ms ` +
            `(tentativas: ${result.attempts}).`,
        );
      }
    })
    .catch((err: unknown) => {
      // Exit code diferente de zero é o que faz o agendador enxergar a falha.
      console.error('[refresh] falhou:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
