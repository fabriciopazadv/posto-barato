/**
 * Aplicador de migrações da Fase 2.
 *
 * Aplica DDL em SQL puro (necessário para PostGIS, matview e funções, que o
 * Prisma Migrate não expressa bem). Ordem:
 *   00_collector_bootstrap.sql  → apenas dev/teste (pulável em produção)
 *   01_app.sql                  → schema `app` da Fase 2 (sempre)
 *
 * Uso:
 *   tsx src/migrate.ts            aplica as migrações
 *   tsx src/migrate.ts --reset    dropa schemas app/collector e reaplica
 *
 * Env:
 *   DATABASE_URL                  conexão (migration_admin em produção)
 *   SKIP_COLLECTOR_BOOTSTRAP=true não aplica o bootstrap do collector (produção)
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(here, '..', 'prisma', 'sql');

async function run(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const skipCollector = process.env.SKIP_COLLECTOR_BOOTSTRAP === 'true';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não definida.');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (reset) {
      console.log('[migrate] reset: dropando schemas app e collector…');
      await client.query('DROP SCHEMA IF EXISTS app CASCADE;');
      if (!skipCollector) {
        await client.query('DROP SCHEMA IF EXISTS collector CASCADE;');
      }
    }

    const files: string[] = [];
    if (!skipCollector) files.push('00_collector_bootstrap.sql');
    files.push('01_app.sql');

    for (const file of files) {
      const sql = await readFile(join(sqlDir, file), 'utf8');
      console.log(`[migrate] aplicando ${file}…`);
      await client.query(sql);
    }
    console.log('[migrate] concluído.');
  } finally {
    await client.end();
  }
}

run().catch((err: unknown) => {
  console.error('[migrate] falhou:', err);
  process.exitCode = 1;
});
