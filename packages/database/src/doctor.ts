/**
 * Diagnóstico do banco antes (e depois) de migrar. Só lê — não cria, não altera
 * e não corrige nada.
 *
 * Existe porque a Fase 2 vai se conectar a um banco que ela não criou. Descobrir
 * que `price_observations` não tem `observed_at` no meio de uma migração é
 * caro; descobrir com um comando de leitura, antes, não é.
 *
 *   pnpm --filter @posto-barato/database doctor
 *
 * Sai com código diferente de zero quando encontra algo que impede a integração.
 */
import { Client } from 'pg';
import { redactDatabaseUrl, resolveDatabaseUrl } from './clients.js';

const REQUIRED_COLUMNS: Record<string, string[]> = {
  data_sources: ['id', 'public_name', 'source_type', 'active'],
  stations: [
    'id', 'display_name', 'display_address', 'neighborhood', 'municipality', 'state',
    'postal_code', 'latitude', 'longitude', 'active', 'first_seen_at', 'last_seen_at',
  ],
  products: ['id', 'canonical_code', 'canonical_name', 'category', 'unit', 'active'],
  price_observations: [
    'id', 'station_id', 'product_id', 'data_source_id', 'price_decimal', 'currency', 'unit',
    'relative_time_text', 'observed_at', 'estimated_observed_at', 'estimated_time',
    'collected_at', 'source_position', 'confidence_score', 'status', 'expires_at', 'created_at',
  ],
};

/** Colunas que jamais podem aparecer nas views da Fase 2 nem na projeção. */
const FORBIDDEN_COLUMNS = [
  'raw_payload', 'raw_visible_data', 'raw_registry_payload', 'evidence_path',
  'observation_fingerprint', 'source_record_hash', 'internal_name', 'fingerprint',
  'screenshot_path', 'html_snapshot_path', 'validation_method', 'collection_run_id',
];

interface Report {
  blocking: string[];
  warnings: string[];
  info: string[];
}

async function inspect(client: Client): Promise<Report> {
  const report: Report = { blocking: [], warnings: [], info: [] };

  const postgis = await client.query<{ version: string }>(
    `SELECT extversion AS version FROM pg_extension WHERE extname = 'postgis'`,
  );
  if (postgis.rowCount === 0) {
    report.blocking.push('PostGIS não instalado (CREATE EXTENSION postgis).');
  } else {
    report.info.push(`PostGIS ${postgis.rows[0]!.version}`);
  }

  // --- Tabelas do coletor -------------------------------------------------
  // pg_attribute e pg_class, e não information_schema: o catálogo padrão SQL é
  // FILTRADO POR PRIVILÉGIO. Um papel sem SELECT em public.stations recebe zero
  // linhas dali, e o diagnóstico sairia "a tabela não existe" quando o problema
  // é permissão — mandando o operador procurar no lugar errado.
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const { rows } = await client.query<{ column_name: string }>(
      `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = $1
         AND a.attnum > 0 AND NOT a.attisdropped`,
      [table],
    );
    if (rows.length === 0) {
      report.blocking.push(`public.${table} não existe.`);
      continue;
    }

    const { rows: priv } = await client.query<{ pode_ler: boolean }>(
      `SELECT has_table_privilege(current_user, $1, 'SELECT') AS pode_ler`,
      [`public.${table}`],
    );
    if (!priv[0]?.pode_ler) {
      // Não é detalhe: as views de compatibilidade rodam com os privilégios de
      // quem as cria, e o Postgres aceita criá-las sem este acesso — só recusa
      // na primeira consulta, já em produção.
      report.blocking.push(
        `Este papel não tem SELECT em public.${table}. ` +
          'Rode operations/prerequisites.sql pelo dono das tabelas do coletor.',
      );
      continue;
    }

    const present = new Set(rows.map((r) => r.column_name));
    const missing = columns.filter((c) => !present.has(c));
    if (missing.length > 0) {
      report.blocking.push(`public.${table} sem as colunas: ${missing.join(', ')}.`);
    } else {
      report.info.push(`public.${table}: ${rows.length} colunas, todas as exigidas presentes.`);
    }
  }

  // --- Views de compatibilidade -------------------------------------------
  const { rows: collectorObjects } = await client.query<{ relname: string; relkind: string }>(
    `SELECT c.relname, c.relkind FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'collector'`,
  );
  if (collectorObjects.length === 0) {
    report.warnings.push('Schema collector vazio — rode as migrações.');
  }
  for (const obj of collectorObjects) {
    if (obj.relkind === 'r' || obj.relkind === 'p') {
      report.blocking.push(
        `collector.${obj.relname} é TABELA. A Fase 2 espera views sobre public.*.`,
      );
    }
  }

  // --- Vazamento de coluna privada ----------------------------------------
  // Novamente pg_attribute: com information_schema, um papel sem privilégio
  // veria zero colunas e o relatório diria "sem vazamento" justamente onde não
  // poderia enxergar nada.
  const { rows: leaks } = await client.query<{ table_name: string; column_name: string }>(
    `SELECT c.relname AS table_name, a.attname AS column_name
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'collector'
       AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname = ANY($1)`,
    [FORBIDDEN_COLUMNS],
  );
  for (const leak of leaks) {
    report.blocking.push(
      `collector.${leak.table_name} expõe a coluna privada ${leak.column_name}.`,
    );
  }

  // --- Projeção pública ----------------------------------------------------
  const { rows: matview } = await client.query<{ populated: boolean }>(
    `SELECT c.relispopulated AS populated FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app' AND c.relname = 'public_latest_prices'`,
  );
  if (matview.length === 0) {
    report.warnings.push('app.public_latest_prices não existe — rode as migrações.');
  } else if (!matview[0]!.populated) {
    report.warnings.push('app.public_latest_prices existe mas nunca foi populada — rode o refresh.');
  } else {
    const { rows } = await client.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM app.public_latest_prices',
    );
    report.info.push(`app.public_latest_prices: ${rows[0]!.total} linhas.`);

    // pg_attribute, e não information_schema.columns: o catálogo padrão SQL não
    // lista materialized views, então a consulta óbvia devolveria zero linhas e
    // a verificação passaria sempre — inclusive com a coluna privada presente.
    const { rows: leakedColumns } = await client.query<{ column_name: string }>(
      `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'app' AND c.relname = 'public_latest_prices'
         AND a.attnum > 0 AND NOT a.attisdropped
         AND a.attname = ANY($1)`,
      [FORBIDDEN_COLUMNS],
    );
    for (const c of leakedColumns) {
      report.blocking.push(`app.public_latest_prices expõe a coluna privada ${c.column_name}.`);
    }
  }

  // --- Último refresh ------------------------------------------------------
  const logExists = await client.query(`SELECT to_regclass('app.price_refresh_log') AS t`);
  if (logExists.rows[0]?.t) {
    const { rows } = await client.query<{
      started_at: Date; outcome: string; duration_ms: number | null;
    }>(
      `SELECT started_at, outcome, duration_ms FROM app.price_refresh_log
       ORDER BY started_at DESC LIMIT 1`,
    );
    if (rows.length === 0) report.warnings.push('Nenhum refresh registrado ainda.');
    else {
      const r = rows[0]!;
      const line = `Último refresh: ${r.started_at.toISOString()} — ${r.outcome} (${r.duration_ms ?? '?'} ms).`;
      if (r.outcome === 'error') report.warnings.push(line);
      else report.info.push(line);
    }
  }

  // --- Papéis --------------------------------------------------------------
  const expectedRoles = ['price_reader', 'app_writer', 'price_refresher', 'collector_writer'];
  const { rows: roles } = await client.query<{ rolname: string; rolsuper: boolean }>(
    `SELECT rolname, rolsuper FROM pg_roles WHERE rolname = ANY($1)`,
    [expectedRoles],
  );
  const found = new Set(roles.map((r) => r.rolname));
  const missingRoles = expectedRoles.filter((r) => !found.has(r));
  if (missingRoles.length > 0) {
    report.warnings.push(`Papéis ausentes: ${missingRoles.join(', ')} (rode operations/roles.sql).`);
  }
  for (const r of roles) {
    if (r.rolsuper) report.blocking.push(`O papel de runtime ${r.rolname} é SUPERUSER.`);
  }

  return report;
}

async function run(): Promise<void> {
  const connectionString = resolveDatabaseUrl('migration');
  console.log(`[doctor] inspecionando ${redactDatabaseUrl(connectionString)}\n`);

  const client = new Client({ connectionString });
  await client.connect();
  let report: Report;
  try {
    report = await inspect(client);
  } finally {
    await client.end();
  }

  for (const line of report.info) console.log(`  ok       ${line}`);
  for (const line of report.warnings) console.log(`  atenção  ${line}`);
  for (const line of report.blocking) console.log(`  BLOQUEIO ${line}`);

  if (report.blocking.length > 0) {
    console.error(`\n[doctor] ${report.blocking.length} bloqueio(s). A integração não deve seguir.`);
    process.exitCode = 1;
  } else {
    console.log('\n[doctor] sem bloqueios.');
  }
}

run().catch((err: unknown) => {
  console.error('[doctor] falhou:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
