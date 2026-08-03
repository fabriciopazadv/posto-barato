/**
 * Preparação do banco descartável usado pelos testes de integração.
 *
 * Ele é montado pelo MESMO caminho da produção: a fixture do coletor, as
 * migrações versionadas e o `operations/grants.sql` de verdade — não uma cópia
 * do DDL escrita no teste. Um setup que monta o schema por conta própria prova
 * que o setup funciona, e é justamente o schema real que precisa de prova.
 *
 * A única coisa recriada aqui é o `roles.sql`, porque aquele arquivo usa
 * meta-comandos de psql (\gexec, \if) que só o psql interpreta. As senhas são
 * fixas e locais — o banco é descartável e nunca sai da máquina do teste.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { SQL_DIR, migrateDatabase } from '@posto-barato/database/migrate';

/** Sem isto os testes de integração não têm banco e se declaram pulados. */
export const ADMIN_URL = process.env.TEST_DATABASE_URL?.trim();

export const TEST_PASSWORDS = {
  price_reader: 'test-price-reader-pw-000001',
  app_writer: 'test-app-writer-pw-00000001',
  price_refresher: 'test-price-refresher-pw-01',
  collector_writer: 'test-collector-writer-pw-01',
} as const;

export type TestRole = keyof typeof TEST_PASSWORDS;

/** URL de conexão de um papel, derivada da URL administrativa do banco de teste. */
export function urlForRole(role: TestRole): string {
  const url = new URL(ADMIN_URL!);
  url.username = role;
  url.password = TEST_PASSWORDS[role];
  return url.toString();
}

export async function adminClient(): Promise<Client> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  return client;
}

/**
 * `grants.sql` é SQL puro exceto pelas linhas de meta-comando do psql, que o
 * driver não entende. Removê-las é o suficiente para executar o arquivo real.
 */
async function applyGrants(client: Client): Promise<void> {
  const raw = await readFile(join(SQL_DIR, 'operations', 'grants.sql'), 'utf8');
  const sql = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('\\'))
    .join('\n');
  await client.query(sql);
}

async function createRoles(client: Client): Promise<void> {
  for (const [role, password] of Object.entries(TEST_PASSWORDS)) {
    await client.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
           CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}';
         END IF;
       END $$`,
    );
    await client.query(`ALTER ROLE ${role} PASSWORD '${password}'`);
  }
}

/** Zera e reconstrói o banco de teste. Chamado uma vez, no globalSetup. */
export async function prepareTestDatabase(): Promise<void> {
  process.env.ALLOW_DESTRUCTIVE_RESET = 'true';
  await migrateDatabase({
    connectionString: ADMIN_URL,
    reset: true,
    confirmDestructive: true,
    devFixture: true,
  });

  const client = await adminClient();
  try {
    await createRoles(client);
    await applyGrants(client);
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Inserção de dados no papel do coletor
// ---------------------------------------------------------------------------

export interface SeedContext {
  dataSourceId: string;
  runId: string;
  productIds: Map<string, string>;
}

export async function seedCatalog(client: Client, products: string[]): Promise<SeedContext> {
  const { rows: ds } = await client.query<{ id: string }>(
    `INSERT INTO public.data_sources (id, internal_name, public_name, source_type)
     VALUES (gen_random_uuid(), 'TEST_SOURCE_' || gen_random_uuid(), 'Banco de Dados Posto Barato', 'TEST')
     RETURNING id`,
  );
  const { rows: run } = await client.query<{ id: string }>(
    `INSERT INTO public.collection_runs
       (id, status, municipality, state, products_requested, collector_version, host_name)
     VALUES (gen_random_uuid(), 'SUCCESS', 'Rondonópolis', 'MT', '["test"]'::jsonb, 'test', 'test-host')
     RETURNING id`,
  );

  const productIds = new Map<string, string>();
  for (const code of products) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO public.products (id, canonical_code, canonical_name, category, unit)
       VALUES (gen_random_uuid(), $1, $1, 'FUEL', 'L')
       ON CONFLICT (canonical_code) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
       RETURNING id`,
      [code],
    );
    productIds.set(code, rows[0]!.id);
  }
  return { dataSourceId: ds[0]!.id, runId: run[0]!.id, productIds };
}

export async function insertStation(
  client: Client,
  station: { name: string; municipality?: string; state?: string; lat?: number; lng?: number },
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO public.stations
       (id, normalized_name, display_name, normalized_address, display_address,
        neighborhood, municipality, state, latitude, longitude, fingerprint,
        active, first_seen_at, last_seen_at,
        cnpj, corporate_name, brand, anp_code, raw_registry_payload)
     VALUES ($1, $2, $3, $4, $5, 'Centro', $6, $7, $8, $9, $10, true, now(), now(),
             '12345678000199', 'RAZAO SOCIAL LTDA', 'MARCA X', 'ANP-123', '{"segredo":true}'::jsonb)`,
    [
      id, station.name.toLowerCase(), station.name, 'rua x', 'Rua X, 1',
      station.municipality ?? 'Rondonópolis', station.state ?? 'MT',
      station.lat ?? -16.47, station.lng ?? -54.63, `fp-${id}`,
    ],
  );
  return id;
}

export interface ObservationInput {
  stationId: string;
  productCode: string;
  price: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  /** Data de negócio. Quando ausente, cai em `estimatedObservedAt`/`collectedAt`. */
  observedAt?: Date;
  estimatedObservedAt?: Date;
  collectedAt?: Date;
  expiresAt?: Date;
}

export async function insertObservation(
  client: Client,
  ctx: SeedContext,
  input: ObservationInput,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO public.price_observations
       (id, station_id, product_id, data_source_id, collection_run_id,
        original_product_name, original_price_text, price_decimal, unit,
        observed_at, estimated_observed_at, estimated_time, collected_at,
        source_position, confidence_score, status, expires_at,
        observation_fingerprint, source_record_hash, raw_payload, evidence_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'L', $9, $10, $11, $12, 0, 0.9, $13, $14,
             $15, 'hash-secreto', '{"segredo":true}'::jsonb, '/evidencias/secreta.png')`,
    [
      id, input.stationId, ctx.productIds.get(input.productCode), ctx.dataSourceId, ctx.runId,
      input.productCode, `R$ ${input.price.toFixed(2)}`, input.price,
      input.observedAt ?? null,
      input.estimatedObservedAt ?? null,
      input.observedAt ? false : true,
      input.collectedAt ?? input.observedAt ?? new Date(),
      input.status,
      input.expiresAt ?? null,
      `fp-obs-${id}`,
    ],
  );
  return id;
}

/** Atualiza a projeção pública com a credencial de `price_refresher`. */
export async function refreshProjection(): Promise<void> {
  const { refreshPublicPrices } = await import('@posto-barato/database/refresh');
  await refreshPublicPrices({
    connectionString: urlForRole('price_refresher'),
    triggeredBy: 'test',
    retries: 0,
  });
}

/** Remove os dados de um teste sem derrubar o schema. */
export async function truncateData(client: Client): Promise<void> {
  await client.query('DELETE FROM app.demo_stations');
  await client.query('DELETE FROM public.observation_evidence');
  await client.query('DELETE FROM public.price_observations');
  await client.query('DELETE FROM public.station_products');
  await client.query('DELETE FROM public.stations');
  await client.query('DELETE FROM public.collection_evidence');
  await client.query('DELETE FROM public.collection_errors');
  await client.query('DELETE FROM public.collection_runs');
  await client.query('DELETE FROM public.products');
  await client.query('DELETE FROM public.data_sources');
}
