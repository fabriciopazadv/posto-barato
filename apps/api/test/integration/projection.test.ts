/**
 * O que a projeção pública publica, e o que ela nunca publica.
 *
 * Estes testes falam com um PostgreSQL de verdade, com PostGIS, montado pelas
 * mesmas migrações que vão para produção. Regra de publicação verificada em SQL
 * é a única prova que vale: a filtragem acontece na view e na matview, não no
 * TypeScript, então um teste com dublê não provaria nada.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { SQL_DIR } from '@posto-barato/database/migrate';
import {
  adminClient,
  insertObservation,
  insertStation,
  refreshProjection,
  seedCatalog,
  truncateData,
  type SeedContext,
} from './helpers/database.js';

const PRODUTO = 'GASOLINA_COMUM';
let db: Client;
let ctx: SeedContext;

function horasAtras(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

beforeAll(async () => {
  db = await adminClient();
});

afterAll(async () => {
  await db.end();
});

beforeEach(async () => {
  await truncateData(db);
  ctx = await seedCatalog(db, [PRODUTO]);
});

describe('regras de publicação por status', () => {
  it('publica observação aprovada', async () => {
    const stationId = await insertStation(db, { name: 'Posto Aprovado' });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 5.79,
      status: 'APPROVED', observedAt: horasAtras(1),
    });
    await refreshProjection();

    const { rows } = await db.query(
      'SELECT price FROM app.public_latest_prices WHERE station_id = $1',
      [stationId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.price)).toBe(5.79);
  });

  it('não publica observação pendente', async () => {
    const stationId = await insertStation(db, { name: 'Posto Pendente' });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 1.11,
      status: 'PENDING', observedAt: horasAtras(1),
    });
    await refreshProjection();

    const { rows } = await db.query(
      'SELECT 1 FROM app.public_latest_prices WHERE station_id = $1',
      [stationId],
    );
    expect(rows).toHaveLength(0);
  });

  it('não publica observação rejeitada', async () => {
    const stationId = await insertStation(db, { name: 'Posto Rejeitado' });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 2.22,
      status: 'REJECTED', observedAt: horasAtras(1),
    });
    await refreshProjection();

    const { rows } = await db.query(
      'SELECT 1 FROM app.public_latest_prices WHERE station_id = $1',
      [stationId],
    );
    expect(rows).toHaveLength(0);
  });

  it('pendente e rejeitada não alcançam nem a view de compatibilidade', async () => {
    const stationId = await insertStation(db, { name: 'Posto Misto' });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 1.11, status: 'PENDING', observedAt: horasAtras(1),
    });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 2.22, status: 'REJECTED', observedAt: horasAtras(2),
    });

    const { rows } = await db.query(
      'SELECT count(*)::int AS total FROM collector.price_observations WHERE station_id = $1',
      [stationId],
    );
    expect(rows[0]!.total).toBe(0);
  });
});

describe('regra adotada para observações expiradas', () => {
  it('publica a expirada, marcada, em vez de sumir com o posto', async () => {
    const stationId = await insertStation(db, { name: 'Posto Expirado' });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 6.49,
      status: 'EXPIRED', observedAt: horasAtras(50), expiresAt: horasAtras(2),
    });
    await refreshProjection();

    const { rows } = await db.query(
      `SELECT price, price_status,
              (price_status = 'EXPIRED' OR (expires_at IS NOT NULL AND expires_at <= now())) AS is_expired
       FROM app.public_latest_prices WHERE station_id = $1`,
      [stationId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.price_status).toBe('EXPIRED');
    expect(rows[0]!.is_expired).toBe(true);
  });

  it('marca como vencida a observação cujo expires_at passou, mesmo ainda APPROVED', async () => {
    // O coletor vira o status por um processo próprio, que pode atrasar. Como a
    // avaliação é feita na leitura, o vencimento vale desde a hora certa.
    const stationId = await insertStation(db, { name: 'Posto Vencendo' });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 5.55,
      status: 'APPROVED', observedAt: horasAtras(3), expiresAt: horasAtras(1),
    });
    await refreshProjection();

    const { rows } = await db.query(
      `SELECT (price_status = 'EXPIRED' OR (expires_at IS NOT NULL AND expires_at <= now())) AS is_expired
       FROM app.public_latest_prices WHERE station_id = $1`,
      [stationId],
    );
    expect(rows[0]!.is_expired).toBe(true);
  });
});

describe('escolha da observação mais recente', () => {
  it('usa a data de negócio, não a data de coleta', async () => {
    const stationId = await insertStation(db, { name: 'Posto Ordem' });

    // Preço antigo na bomba, recoletado agora há pouco.
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 9.99,
      status: 'APPROVED', observedAt: horasAtras(48), collectedAt: horasAtras(1),
    });
    // Preço novo na bomba, coletado há mais tempo.
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 5.49,
      status: 'APPROVED', observedAt: horasAtras(2), collectedAt: horasAtras(2),
    });
    await refreshProjection();

    const { rows } = await db.query(
      'SELECT price FROM app.public_latest_prices WHERE station_id = $1',
      [stationId],
    );
    expect(rows).toHaveLength(1);
    // Ordenar por collected_at devolveria 9.99 — o preço de dois dias atrás.
    expect(Number(rows[0]!.price)).toBe(5.49);
  });

  it('cai em estimated_observed_at e depois em collected_at quando falta observed_at', async () => {
    const stationId = await insertStation(db, { name: 'Posto Fallback' });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 7.77,
      status: 'APPROVED', estimatedObservedAt: horasAtras(1), collectedAt: horasAtras(30),
    });
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 8.88,
      status: 'APPROVED', collectedAt: horasAtras(20),
    });
    await refreshProjection();

    const { rows } = await db.query(
      'SELECT price, observed_at_estimated FROM app.public_latest_prices WHERE station_id = $1',
      [stationId],
    );
    // A estimada de 1 hora atrás ganha da coletada de 20 horas atrás.
    expect(Number(rows[0]!.price)).toBe(7.77);
    expect(rows[0]!.observed_at_estimated).toBe(true);
  });
});

describe('campos privados', () => {
  it('não existem como coluna na projeção pública', async () => {
    // pg_attribute, e não information_schema: o catálogo padrão não lista
    // materialized views, então a consulta óbvia passaria sempre.
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'app' AND c.relname = 'public_latest_prices'
         AND a.attnum > 0 AND NOT a.attisdropped`,
    );
    const columns = rows.map((r) => r.column_name);

    for (const proibida of [
      'raw_payload', 'raw_registry_payload', 'evidence_path', 'observation_fingerprint',
      'source_record_hash', 'internal_name', 'fingerprint', 'validation_method',
      'collection_run_id', 'cnpj', 'corporate_name', 'anp_code', 'anp_authorization',
      'registry_source', 'last_registry_sync', 'normalized_name', 'normalized_address',
    ]) {
      expect(columns).not.toContain(proibida);
    }
    expect(columns).toContain('price');
    expect(columns).toContain('observed_at');
  });

  it('não existem como coluna nas views de compatibilidade', async () => {
    const { rows } = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'collector'`,
    );
    const proibidas = [
      'raw_payload', 'raw_registry_payload', 'evidence_path', 'observation_fingerprint',
      'source_record_hash', 'internal_name', 'fingerprint', 'validation_method',
      'collection_run_id', 'cnpj', 'anp_code',
    ];
    for (const row of rows) {
      expect(proibidas).not.toContain(row.column_name);
    }
  });

  it('não expõe tabelas de evidência dentro do schema collector', async () => {
    const { rows } = await db.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'collector'`,
    );
    const nomes = rows.map((r) => r.relname);
    expect(nomes).not.toContain('collection_evidence');
    expect(nomes).not.toContain('observation_evidence');
    expect(nomes).not.toContain('collection_errors');
    expect(nomes).not.toContain('collection_runs');
  });

  it('recriar a projeção preserva os grants concedidos', async () => {
    // Postgres não tem CREATE OR REPLACE MATERIALIZED VIEW, então a migração
    // recria a projeção — e um DROP leva os privilégios junto. Se a preservação
    // falhar, `price_reader` perde o acesso e a API cai no primeiro deploy que
    // tocar nesta migração, sem nada acusar até lá.
    const privilegios = async (): Promise<string[]> => {
      const { rows } = await db.query<{ privilege_type: string }>(
        `SELECT a.privilege_type
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) a
         WHERE n.nspname = 'app' AND c.relname = 'public_latest_prices'
           AND pg_get_userbyid(a.grantee) = 'price_reader'`,
      );
      return rows.map((r) => r.privilege_type).sort();
    };

    expect(await privilegios()).toEqual(['SELECT']);

    const sql = await readFile(
      join(SQL_DIR, 'migrations', '0004_public_latest_prices.sql'),
      'utf8',
    );
    await db.query(sql);

    expect(await privilegios()).toEqual(['SELECT']);
  });

  it('a migração recusa criar as views sem SELECT nas tabelas-base', async () => {
    // O Postgres ACEITA `CREATE VIEW` sobre uma tabela que o criador não pode
    // ler; o erro só aparece quando alguém consulta a view. Sem o preflight, a
    // migração terminaria com sucesso, o ledger registraria tudo aplicado, e a
    // API quebraria em produção na primeira requisição — onde o papel que migra
    // não é dono das tabelas do coletor.
    await db.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'papel_sem_privilegio') THEN
          CREATE ROLE papel_sem_privilegio NOLOGIN;
        END IF;
      END $$`);
    // CREATE no banco para o papel chegar até o preflight: o que precisa faltar
    // é o SELECT nas tabelas do coletor, não a permissão de criar schema.
    await db.query(
      `DO $$ BEGIN
         EXECUTE format('GRANT CREATE ON DATABASE %I TO papel_sem_privilegio', current_database());
       END $$`,
    );

    const sql = await readFile(
      join(SQL_DIR, 'migrations', '0003_collector_compat_views.sql'),
      'utf8',
    );

    await db.query('BEGIN');
    try {
      await db.query('SET LOCAL ROLE papel_sem_privilegio');
      await expect(db.query(sql)).rejects.toThrow(/não tem SELECT em/);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('o schema collector contém apenas views, nunca tabelas', async () => {
    const { rows } = await db.query<{ relkind: string }>(
      `SELECT c.relkind FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'collector' AND c.relkind IN ('r','p','v','m')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.relkind).toBe('v');
  });
});
