/**
 * Aplicador de migrações da Fase 2.
 *
 * O aplicador anterior relia os três arquivos SQL inteiros a cada execução, sem
 * registro do que já tinha rodado. Isso funciona enquanto todo DDL é idempotente
 * e deixa de funcionar no primeiro `DROP ... CASCADE` — que era exatamente o
 * caso da matview: cada `db:migrate` derrubava a projeção pública e os grants
 * junto. Aqui cada arquivo roda uma vez só, registrado, em transação e sob lock.
 *
 * Uso:
 *   tsx src/migrate.ts                 aplica o que estiver pendente
 *   tsx src/migrate.ts --status        lista aplicadas e pendentes, não escreve
 *   tsx src/migrate.ts --dev-fixture   cria as tabelas do coletor (só local)
 *   tsx src/migrate.ts --reset         destrutivo, exige confirmação explícita
 *
 * Ambiente:
 *   DATABASE_MIGRATION_URL   conexão de `migration_admin` (DATABASE_URL fora de produção)
 *   NODE_ENV=production      bloqueia fixture e reset
 */
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { redactDatabaseUrl, resolveDatabaseUrl } from './clients.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(here, '..', 'prisma', 'sql');
const migrationsDir = join(sqlDir, 'migrations');

/** Raiz dos arquivos SQL — os testes de integração leem `operations/grants.sql`
 * daqui para exercitar o arquivo que vai para produção, e não uma cópia. */
export const SQL_DIR = sqlDir;

/**
 * Chave do advisory lock. Sessão inteira, não transação: precisa sobreviver
 * entre as transações de cada migração, para que duas implantações simultâneas
 * não apliquem arquivos diferentes ao mesmo tempo.
 */
const MIGRATION_LOCK_KEY = 4021761;

interface Migration {
  version: string;
  name: string;
  file: string;
  sql: string;
  checksum: string;
}

async function loadMigrations(): Promise<Migration[]> {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const version = file.slice(0, file.indexOf('_'));
      return {
        version,
        name: file.slice(version.length + 1, -4),
        file,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

async function ensureLedger(client: Client): Promise<void> {
  // O registro mora no schema que a primeira migração cria, então ele precisa
  // existir antes dela. Só estas duas linhas ficam fora do controle de versão
  // das migrações — e as duas são idempotentes.
  await client.query('CREATE SCHEMA IF NOT EXISTS app');
  await client.query(`
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version     text PRIMARY KEY,
      name        text NOT NULL,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      duration_ms integer NOT NULL
    )`);
}

interface AppliedRow {
  version: string;
  name: string;
  checksum: string;
}

async function loadApplied(client: Client): Promise<Map<string, AppliedRow>> {
  const { rows } = await client.query<AppliedRow>(
    'SELECT version, name, checksum FROM app.schema_migrations',
  );
  return new Map(rows.map((r) => [r.version, r]));
}

/**
 * Uma migração já aplicada que muda de conteúdo é sempre um erro: ou alguém
 * editou história que outro banco já tem, ou os arquivos e o banco vieram de
 * ramos diferentes. Aplicar de novo produziria dois bancos com o mesmo número
 * de versão e schemas diferentes, então paramos.
 */
function assertUnchanged(migrations: Migration[], applied: Map<string, AppliedRow>): void {
  const drifted = migrations
    .filter((m) => applied.has(m.version) && applied.get(m.version)!.checksum !== m.checksum)
    .map((m) => m.file);

  if (drifted.length > 0) {
    throw new Error(
      `Migrações já aplicadas foram alteradas: ${drifted.join(', ')}. ` +
        'Escreva uma migração nova em vez de editar uma que já rodou.',
    );
  }
}

async function applyPending(client: Client): Promise<number> {
  const migrations = await loadMigrations();
  const applied = await loadApplied(client);
  assertUnchanged(migrations, applied);

  const pending = migrations.filter((m) => !applied.has(m.version));
  if (pending.length === 0) {
    console.log('[migrate] nada pendente.');
    return 0;
  }

  for (const m of pending) {
    const startedAt = Date.now();
    console.log(`[migrate] aplicando ${m.file}…`);
    // Transação por migração: ou o arquivo inteiro entra, ou nada dele entra e
    // o registro não avança. É isso que impede um estado parcial silencioso.
    await client.query('BEGIN');
    try {
      await client.query(m.sql);
      await client.query(
        `INSERT INTO app.schema_migrations (version, name, checksum, duration_ms)
         VALUES ($1, $2, $3, $4)`,
        [m.version, m.name, m.checksum, Date.now() - startedAt],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migração ${m.file} falhou e foi revertida: ${(err as Error).message}`, {
        cause: err,
      });
    }
    console.log(`[migrate] ${m.file} ok (${Date.now() - startedAt} ms)`);
  }
  return pending.length;
}

async function printStatus(client: Client): Promise<void> {
  const migrations = await loadMigrations();
  const applied = await loadApplied(client);
  for (const m of migrations) {
    const row = applied.get(m.version);
    const state = !row ? 'PENDENTE' : row.checksum === m.checksum ? 'aplicada' : 'ALTERADA';
    console.log(`  ${state.padEnd(9)} ${m.file}`);
  }
  const orphans = [...applied.keys()].filter((v) => !migrations.some((m) => m.version === v));
  for (const v of orphans) {
    console.log(`  ÓRFÃ      ${v} (registrada no banco, sem arquivo correspondente)`);
  }
}

/**
 * Fixture de desenvolvimento: cria as tabelas do coletor em `public.*`. Em
 * produção elas já existem e são de outro time — recriá-las seria escrever no
 * banco de quem não nos autorizou. Daí os dois bloqueios.
 */
async function applyDevFixture(client: Client): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('A fixture do coletor não roda com NODE_ENV=production.');
  }
  if (process.env.SKIP_COLLECTOR_BOOTSTRAP === 'true') {
    throw new Error('SKIP_COLLECTOR_BOOTSTRAP=true — fixture do coletor não aplicada.');
  }
  const sql = await readFile(join(sqlDir, 'dev', 'collector_fixture.sql'), 'utf8');
  console.log('[migrate] aplicando fixture de desenvolvimento (public.*)…');
  await client.query(sql);
}

/**
 * Reset destrutivo. Três travas, porque o comando existente antes derrubava
 * `collector` a partir de uma única flag — e `collector`, em produção, são as
 * tabelas do coletor.
 */
async function reset(client: Client, confirmed: boolean): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('reset é proibido com NODE_ENV=production.');
  }
  if (process.env.ALLOW_DESTRUCTIVE_RESET !== 'true') {
    throw new Error(
      'reset apaga os schemas app e collector e as tabelas da fixture. ' +
        'Confirme com ALLOW_DESTRUCTIVE_RESET=true no ambiente.',
    );
  }
  if (!confirmed) {
    throw new Error('reset exige também a flag --yes-drop-everything.');
  }

  console.log('[migrate] reset: removendo schema app e as views de compatibilidade…');
  await client.query('DROP SCHEMA IF EXISTS app CASCADE');
  await client.query('DROP SCHEMA IF EXISTS collector CASCADE');

  // Tabelas da fixture. Nomeadas uma a uma: um `DROP SCHEMA public CASCADE`
  // levaria junto qualquer coisa que o coletor tenha ali.
  const fixtureTables = [
    'observation_evidence',
    'collection_errors',
    'collection_evidence',
    'price_observations',
    'station_products',
    'stations',
    'products',
    'collection_runs',
    'data_sources',
  ];
  for (const t of fixtureTables) {
    await client.query(`DROP TABLE IF EXISTS public.${t} CASCADE`);
  }
  await client.query('DROP TYPE IF EXISTS public."ObservationStatus"');
  await client.query('DROP TYPE IF EXISTS public."CollectionRunStatus"');
}

export interface MigrateOptions {
  connectionString?: string;
  /** Cria as tabelas do coletor em public.* (só fora de produção). */
  devFixture?: boolean;
  /** Apaga schemas e fixture antes de migrar. Exige as travas de `reset()`. */
  reset?: boolean;
  /** Segunda trava do reset, equivalente a `--yes-drop-everything` na CLI. */
  confirmDestructive?: boolean;
  /** Só relata o estado; não escreve nada. */
  statusOnly?: boolean;
}

/**
 * Aplica as migrações pendentes. Exportado para que a preparação do banco de
 * testes use exatamente este caminho — um setup de teste que monta o schema por
 * conta própria testa o schema do setup, não o que vai para produção.
 */
export async function migrateDatabase(options: MigrateOptions = {}): Promise<number> {
  const connectionString = options.connectionString ?? resolveDatabaseUrl('migration');
  const client = new Client({ connectionString });

  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Não foi possível conectar em ${redactDatabaseUrl(connectionString)}: ${(err as Error).message}`,
      { cause: err },
    );
  }

  try {
    // Sem o lock, duas implantações simultâneas leem "pendente" ao mesmo tempo e
    // aplicam o mesmo arquivo duas vezes.
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [MIGRATION_LOCK_KEY],
    );
    if (!rows[0]?.locked) {
      throw new Error('Outra migração está em andamento neste banco. Nada foi aplicado.');
    }

    if (options.reset) await reset(client, options.confirmDestructive === true);
    if (options.devFixture) await applyDevFixture(client);

    await ensureLedger(client);

    if (options.statusOnly) {
      await printStatus(client);
      return 0;
    }

    return await applyPending(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {
      // A conexão pode já ter caído; o lock morre com a sessão de qualquer forma.
    });
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase({
    devFixture: process.argv.includes('--dev-fixture'),
    reset: process.argv.includes('--reset'),
    confirmDestructive: process.argv.includes('--yes-drop-everything'),
    statusOnly: process.argv.includes('--status'),
  })
    .then((count) => {
      if (count > 0) {
        console.log(`[migrate] ${count} migração(ões) aplicada(s).`);
        console.log('[migrate] lembre-se de rodar prisma/sql/operations/grants.sql.');
      }
    })
    .catch((err: unknown) => {
      console.error('[migrate] falhou:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
