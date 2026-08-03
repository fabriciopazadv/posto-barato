/**
 * A fronteira de privilégio, verificada contra o banco.
 *
 * O desenho inteiro depende de uma afirmação que só o PostgreSQL pode
 * confirmar: `price_reader` enxerga os preços através das views e não enxerga as
 * tabelas por baixo delas. Se isso deixar de valer — um grant a mais, uma view
 * recriada como `security_invoker` — nenhum teste de TypeScript acusaria.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { urlForRole, type TestRole } from './helpers/database.js';

const clients = new Map<TestRole, Client>();

async function connect(role: TestRole): Promise<Client> {
  let client = clients.get(role);
  if (!client) {
    client = new Client({ connectionString: urlForRole(role) });
    await client.connect();
    clients.set(role, client);
  }
  return client;
}

/** Executa e devolve 'ok' ou o código de erro do Postgres (42501 = sem permissão). */
async function tentar(role: TestRole, sql: string): Promise<string> {
  const client = await connect(role);
  try {
    await client.query(sql);
    return 'ok';
  } catch (err) {
    // Transação abortada precisa ser encerrada antes da próxima consulta.
    await client.query('ROLLBACK').catch(() => undefined);
    return (err as { code?: string }).code ?? 'erro';
  }
}

const SEM_PERMISSAO = ['42501', '42P01']; // insufficient_privilege, undefined_table

beforeAll(async () => {
  await Promise.all([connect('price_reader'), connect('app_writer'), connect('price_refresher')]);
});

afterAll(async () => {
  await Promise.all([...clients.values()].map((c) => c.end()));
  clients.clear();
});

describe('price_reader', () => {
  it('lê a projeção pública e as views do coletor', async () => {
    expect(await tentar('price_reader', 'SELECT count(*) FROM app.public_latest_prices')).toBe('ok');
    expect(await tentar('price_reader', 'SELECT count(*) FROM collector.price_observations')).toBe('ok');
    expect(await tentar('price_reader', 'SELECT count(*) FROM collector.products')).toBe('ok');
  });

  it.each([
    ['collection_evidence', 'SELECT count(*) FROM public.collection_evidence'],
    ['observation_evidence', 'SELECT count(*) FROM public.observation_evidence'],
    ['collection_errors', 'SELECT count(*) FROM public.collection_errors'],
    ['collection_runs', 'SELECT count(*) FROM public.collection_runs'],
  ])('não lê evidências nem erros: %s', async (_nome, sql) => {
    expect(SEM_PERMISSAO).toContain(await tentar('price_reader', sql));
  });

  it.each([
    ['price_observations', 'SELECT raw_payload FROM public.price_observations'],
    ['stations', 'SELECT cnpj, raw_registry_payload FROM public.stations'],
    ['data_sources', 'SELECT internal_name FROM public.data_sources'],
  ])('não lê as tabelas-base do coletor: %s', async (_nome, sql) => {
    expect(SEM_PERMISSAO).toContain(await tentar('price_reader', sql));
  });

  it.each([
    ['insere conta', "INSERT INTO app.users (email, password_hash) VALUES ('x@x.com','h')"],
    ['altera preço', 'UPDATE public.price_observations SET price_decimal = 1'],
    ['altera projeção', 'DELETE FROM app.public_latest_prices'],
    ['insere posto demo', "INSERT INTO app.demo_stations (station_id) VALUES (gen_random_uuid())"],
  ])('não grava em lugar nenhum: %s', async (_nome, sql) => {
    expect(await tentar('price_reader', sql)).not.toBe('ok');
  });
});

describe('app_writer', () => {
  it('grava autenticação e cobrança', async () => {
    const email = `t-${Date.now()}@exemplo.com`;
    expect(
      await tentar('app_writer', `INSERT INTO app.users (email, password_hash) VALUES ('${email}','h')`),
    ).toBe('ok');
    expect(await tentar('app_writer', 'SELECT count(*) FROM app.subscriptions')).toBe('ok');
    expect(await tentar('app_writer', 'SELECT count(*) FROM app.refresh_tokens')).toBe('ok');
    expect(await tentar('app_writer', 'SELECT count(*) FROM app.billing_events')).toBe('ok');
  });

  it.each([
    ['lê o coletor', 'SELECT count(*) FROM collector.price_observations'],
    ['altera o coletor', "UPDATE public.stations SET display_name = 'x'"],
    ['insere no coletor', 'INSERT INTO public.products (canonical_code, canonical_name, category, unit) VALUES (\'X\',\'X\',\'FUEL\',\'L\')'],
    ['lê a projeção pública', 'SELECT count(*) FROM app.public_latest_prices'],
  ])('não alcança os dados do coletor: %s', async (_nome, sql) => {
    expect(await tentar('app_writer', sql)).not.toBe('ok');
  });
});

describe('price_refresher', () => {
  it('executa o refresh sem poder ler nada', async () => {
    expect(await tentar('price_refresher', 'SELECT app.refresh_public_prices()')).toBe('ok');
    expect(await tentar('price_refresher', 'SELECT count(*) FROM app.public_latest_prices')).not.toBe('ok');
    expect(await tentar('price_refresher', 'SELECT count(*) FROM collector.price_observations')).not.toBe('ok');
  });
});

describe('papéis de runtime', () => {
  it('nenhum é superusuário nem pode criar banco ou papel', async () => {
    const client = await connect('price_reader');
    const { rows } = await client.query<{
      rolname: string; rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean;
    }>(
      `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles
       WHERE rolname = ANY($1)`,
      [['price_reader', 'app_writer', 'price_refresher', 'collector_writer']],
    );
    expect(rows.length).toBe(4);
    for (const r of rows) {
      expect(r.rolsuper, `${r.rolname} é SUPERUSER`).toBe(false);
      expect(r.rolcreatedb, `${r.rolname} tem CREATEDB`).toBe(false);
      expect(r.rolcreaterole, `${r.rolname} tem CREATEROLE`).toBe(false);
    }
  });
});
