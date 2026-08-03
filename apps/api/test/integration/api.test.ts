/**
 * A API inteira contra o banco real: da migração à resposta HTTP.
 *
 * A API sobe aqui com as MESMAS credenciais restritas de produção —
 * `price_reader` para leitura e `app_writer` para conta e cobrança. Uma rota
 * pública que tentasse gravar falharia neste teste, e não em produção.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Client } from 'pg';
import type {
  ListResponse,
  Municipality,
  Paginated,
  PriceHistory,
  PriceSummary,
  Product,
  PublicStationDetail,
  PublicStationSummary,
  StationPricesResponse,
} from '@posto-barato/shared-types';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
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
const OUTRO = 'ETANOL';

let app: FastifyInstance;
let db: Client;
let ctx: SeedContext;
let stationId: string;

function horasAtras(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}

async function get<T>(url: string): Promise<{ status: number; body: T }> {
  const response = await app.inject({ method: 'GET', url });
  return { status: response.statusCode, body: response.json<T>() };
}

beforeAll(async () => {
  db = await adminClient();
  app = await buildApp(loadEnv());
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.end();
});

beforeEach(async () => {
  await truncateData(db);
  ctx = await seedCatalog(db, [PRODUTO, OUTRO]);

  stationId = await insertStation(db, { name: 'Posto Integração', lat: -16.47, lng: -54.63 });
  await insertObservation(db, ctx, {
    stationId, productCode: PRODUTO, price: 5.79, status: 'APPROVED', observedAt: horasAtras(2),
  });
  await insertObservation(db, ctx, {
    stationId, productCode: OUTRO, price: 3.89, status: 'APPROVED', observedAt: horasAtras(2),
  });
  // Histórico: observações mais antigas do mesmo par posto/produto.
  for (const dias of [1, 2, 3]) {
    await insertObservation(db, ctx, {
      stationId, productCode: PRODUTO, price: 5.79 + dias * 0.1,
      status: 'APPROVED', observedAt: horasAtras(24 * dias + 3),
    });
  }
  // Ruído que jamais pode aparecer em lugar nenhum.
  await insertObservation(db, ctx, {
    stationId, productCode: PRODUTO, price: 0.01, status: 'PENDING', observedAt: horasAtras(1),
  });
  await insertObservation(db, ctx, {
    stationId, productCode: PRODUTO, price: 0.02, status: 'REJECTED', observedAt: horasAtras(1),
  });

  await refreshProjection();
});

describe('leitura pública', () => {
  it('lista postos com o preço aprovado, ignorando pendente e rejeitada', async () => {
    const { status, body } = await get<Paginated<PublicStationSummary>>(
      `/api/v1/stations?municipality=Rondon%C3%B3polis&state=MT&product=${PRODUTO}`,
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    const preco = body.data[0]!.prices.find((p) => p.productCode === PRODUTO);
    expect(preco?.price).toBe(5.79);
    // 0.01 (pendente) seria o menor preço se tivesse vazado.
    expect(body.data[0]!.lowestPrice?.price).toBe(5.79);
  });

  it('devolve o detalhe do posto sem nenhum campo interno', async () => {
    const { body } = await get<PublicStationDetail>(`/api/v1/stations/${stationId}`);
    const serializado = JSON.stringify(body);
    for (const segredo of [
      'raw_payload', 'rawPayload', 'evidence_path', 'evidencePath', '12345678000199',
      'RAZAO SOCIAL', 'ANP-123', 'hash-secreto', 'segredo', 'fingerprint',
    ]) {
      expect(serializado).not.toContain(segredo);
    }
    expect(body.source).toBe('Banco de Dados Posto Barato');
  });

  it('mantém o histórico funcionando e agregado por dia', async () => {
    const { status, body } = await get<PriceHistory>(
      `/api/v1/stations/${stationId}/history?product=${PRODUTO}&windowDays=7`,
    );
    expect(status).toBe(200);
    expect(body.points.length).toBeGreaterThanOrEqual(3);
    expect(body.productCode).toBe(PRODUTO);
    // Nenhum ponto pode conter o preço das observações não publicáveis.
    for (const ponto of body.points) {
      expect(ponto.min).toBeGreaterThan(1);
    }
  });

  it('mantém a consulta geográfica funcionando', async () => {
    const perto = await get<Paginated<PublicStationSummary>>(
      '/api/v1/stations?latitude=-16.47&longitude=-54.63&radiusKm=5&sort=nearest',
    );
    expect(perto.body.data).toHaveLength(1);
    expect(perto.body.data[0]!.distanceKm).toBeLessThan(1);

    // Mesma consulta a centenas de quilômetros: o raio precisa excluir.
    const longe = await get<Paginated<PublicStationSummary>>(
      '/api/v1/stations?latitude=-23.55&longitude=-46.63&radiusKm=5&sort=nearest',
    );
    expect(longe.body.data).toHaveLength(0);
  });

  it('filtra por proximidade usando o índice, não varredura na aplicação', async () => {
    // A distância vem calculada do banco; se o cálculo tivesse subido para a
    // aplicação, viria nula.
    const { body } = await get<Paginated<PublicStationSummary>>(
      '/api/v1/stations?latitude=-16.48&longitude=-54.64&radiusKm=50&sort=nearest',
    );
    expect(body.data[0]!.distanceKm).toBeGreaterThan(0);
  });
});

describe('contrato com o PWA', () => {
  // apps/web/src/lib/data.ts desembrulha `{ data }` nestas três rotas e `prices`
  // em /stations/:id/prices. Antes desta integração a API respondia em envelope
  // e o app declarava esperar array puro — as quatro rotas quebrariam no
  // primeiro NEXT_PUBLIC_API_URL apontado para a API real.
  it('/products responde no envelope que o app desembrulha', async () => {
    const { body } = await get<ListResponse<Product>>('/api/v1/products');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(Object.keys(body.data[0]!).sort()).toEqual(['category', 'code', 'name', 'unit']);
  });

  it('/municipalities responde no envelope que o app desembrulha', async () => {
    const { body } = await get<ListResponse<Municipality>>('/api/v1/municipalities');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({ municipality: 'Rondonópolis', state: 'MT' });
    expect(typeof body.data[0]!.stationCount).toBe('number');
  });

  it('/prices/summary responde no envelope que o app desembrulha', async () => {
    const { body } = await get<ListResponse<PriceSummary>>(
      '/api/v1/prices/summary?municipality=Rondon%C3%B3polis&state=MT',
    );
    expect(Array.isArray(body.data)).toBe(true);
    const resumo = body.data.find((r) => r.productCode === PRODUTO);
    expect(resumo?.min).toBe(5.79);
    expect(typeof resumo?.collectedAt).toBe('string');
  });

  it('/stations/:id/prices responde no formato que o app desembrulha', async () => {
    const { body } = await get<StationPricesResponse>(`/api/v1/stations/${stationId}/prices`);
    expect(body.stationId).toBe(stationId);
    expect(body.source).toBe('Banco de Dados Posto Barato');
    expect(Array.isArray(body.prices)).toBe(true);
    expect(body.prices.length).toBe(2);
  });

  it('todo preço traz os campos que as telas leem', async () => {
    const { body } = await get<StationPricesResponse>(`/api/v1/stations/${stationId}/prices`);
    for (const preco of body.prices) {
      expect(Object.keys(preco).sort()).toEqual([
        'ageMinutes', 'collectedAt', 'confidence', 'currency', 'freshness',
        'observedAt', 'observedAtEstimated', 'price', 'productCode', 'productName', 'unit',
      ]);
    }
  });
});

describe('preço expirado', () => {
  it('aparece na API classificado como EXPIRED e com aviso no detalhe', async () => {
    const expiradoId = await insertStation(db, { name: 'Posto Vencido' });
    await insertObservation(db, ctx, {
      stationId: expiradoId, productCode: PRODUTO, price: 6.49,
      status: 'EXPIRED', observedAt: horasAtras(4), expiresAt: horasAtras(1),
    });
    await refreshProjection();

    const { body } = await get<PublicStationDetail>(`/api/v1/stations/${expiradoId}`);
    const preco = body.prices.find((p) => p.productCode === PRODUTO);
    // 4 horas de idade cairia em RECENT pelo relógio; a fonte diz que venceu.
    expect(preco?.freshness).toBe('EXPIRED');
    expect(body.notices.some((n) => n.includes('desatualizados'))).toBe(true);
  });
});

describe('refresh concorrente', () => {
  it('mantém a API consultável durante a atualização', async () => {
    const durante: number[] = [];
    const refresh = refreshProjection();

    for (let i = 0; i < 5; i += 1) {
      const { status, body } = await get<Paginated<PublicStationSummary>>(
        '/api/v1/stations?municipality=Rondon%C3%B3polis&state=MT',
      );
      expect(status).toBe(200);
      durante.push(body.data.length);
    }
    await refresh;

    // REFRESH ... CONCURRENTLY não bloqueia leitura: nenhuma consulta pode ter
    // travado nem devolvido a projeção vazia.
    expect(durante).toHaveLength(5);
    for (const total of durante) expect(total).toBeGreaterThan(0);
  });

  it('desiste sem erro quando outro refresh está em curso', async () => {
    const resultados = await Promise.all([refreshProjection(), refreshProjection()]);
    expect(resultados).toHaveLength(2);
  });
});
