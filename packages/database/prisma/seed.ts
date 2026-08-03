/**
 * Seed DEMONSTRATIVO da Fase 2 — Rondonópolis/MT (seção 35).
 *
 * Escreve em `public.*`, no papel de coletor: é a Fase 1 que povoa aquelas
 * tabelas, e o seed imita esse lado para o ambiente local ter o que ler. Depois
 * registra os postos em `app.demo_stations`, e é isso que faz a API rotular as
 * respostas como "Dados demonstrativos".
 *
 * NUNCA rode isto contra o banco real: ele insere postos fictícios nas mesmas
 * tabelas em que o coletor grava os verdadeiros. Por isso a trava de NODE_ENV.
 *
 * SQL parametrizado direto, e não Prisma: os modelos Prisma da Fase 2 apontam
 * para as views somente-leitura de `collector.*`, que por construção não aceitam
 * escrita — e além disso o seed precisa preencher colunas internas
 * (fingerprint, raw_payload, collection_run_id) que os modelos não declaram.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { resolveDatabaseUrl } from '../src/clients.js';
import { refreshPublicPrices } from '../src/refresh.js';

const DEMO_HOST = 'seed-demo';
const RONDONOPOLIS = { municipality: 'Rondonópolis', state: 'MT' };

const PRODUCTS = [
  { code: 'ETANOL', name: 'Etanol', category: 'FUEL', unit: 'L' },
  { code: 'ETANOL_ADITIVADO', name: 'Etanol aditivado', category: 'FUEL', unit: 'L' },
  { code: 'GASOLINA_COMUM', name: 'Gasolina comum', category: 'FUEL', unit: 'L' },
  { code: 'GASOLINA_ADITIVADA', name: 'Gasolina aditivada', category: 'FUEL', unit: 'L' },
  { code: 'DIESEL_COMUM', name: 'Diesel comum', category: 'FUEL', unit: 'L' },
  { code: 'DIESEL_S10', name: 'Diesel S-10', category: 'FUEL', unit: 'L' },
  { code: 'GNV', name: 'GNV', category: 'FUEL', unit: 'M3' },
];

interface DemoStation {
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  /** horas atrás em que foi observado (exercita as faixas de frescor). */
  observedHoursAgo: number;
  prices: Partial<Record<string, number>>;
}

const STATIONS: DemoStation[] = [
  { name: 'Posto Centro Avenida', address: 'Av. Fernando Corrêa da Costa, 1200 - Centro', neighborhood: 'Centro',
    lat: -16.4707, lng: -54.6357, observedHoursAgo: 2,
    prices: { ETANOL: 3.89, GASOLINA_COMUM: 5.79, GASOLINA_ADITIVADA: 5.99, DIESEL_S10: 5.99 } },
  { name: 'Auto Posto Vila Aurora', address: 'Av. Bandeirantes, 800 - Vila Aurora', neighborhood: 'Vila Aurora',
    lat: -16.4592, lng: -54.6301, observedHoursAgo: 5,
    prices: { ETANOL: 3.79, GASOLINA_COMUM: 5.69, DIESEL_COMUM: 5.89, DIESEL_S10: 5.95 } },
  { name: 'Posto Jardim Tropical', address: 'R. Rio Branco, 55 - Jardim Tropical', neighborhood: 'Jardim Tropical',
    lat: -16.4801, lng: -54.6449, observedHoursAgo: 10,
    prices: { ETANOL: 3.95, GASOLINA_COMUM: 5.85, GASOLINA_ADITIVADA: 6.05, GNV: 4.19 } },
  { name: 'Posto Rodoviária BR-364', address: 'BR-364, Km 12 - Distrito Industrial', neighborhood: 'Distrito Industrial',
    lat: -16.4419, lng: -54.6102, observedHoursAgo: 20,
    prices: { GASOLINA_COMUM: 5.72, DIESEL_COMUM: 5.79, DIESEL_S10: 5.85, ETANOL: 3.85 } },
  { name: 'Posto Cidade Alta', address: 'Av. Lions Internacional, 2300 - Cidade Alta', neighborhood: 'Cidade Alta',
    lat: -16.4885, lng: -54.6218, observedHoursAgo: 30,
    prices: { ETANOL: 3.99, GASOLINA_COMUM: 5.89, GASOLINA_ADITIVADA: 6.09 } },
  { name: 'Auto Posto Sagrada Família', address: 'R. Barão do Rio Branco, 900 - Sagrada Família', neighborhood: 'Sagrada Família',
    lat: -16.4650, lng: -54.6500, observedHoursAgo: 48,
    prices: { ETANOL: 3.92, GASOLINA_COMUM: 5.82, DIESEL_S10: 5.92 } },
  { name: 'Posto Parque das Águas', address: 'Av. dos Estudantes, 400 - Parque das Águas', neighborhood: 'Parque das Águas',
    lat: -16.4990, lng: -54.6380, observedHoursAgo: 80,
    prices: { GASOLINA_COMUM: 5.99, ETANOL: 4.05, DIESEL_S10: 6.09 } },
  { name: 'Posto Vila Operária', address: 'R. Dom Pedro II, 150 - Vila Operária', neighborhood: 'Vila Operária',
    lat: -16.4560, lng: -54.6420, observedHoursAgo: 3,
    prices: { ETANOL: 3.83, GASOLINA_COMUM: 5.75, GASOLINA_ADITIVADA: 5.95, DIESEL_COMUM: 5.84, GNV: 4.09 } },
];

function slug(...parts: string[]): string {
  return parts.join('|').toLowerCase().replace(/\s+/g, '-');
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'O seed insere postos fictícios nas tabelas do coletor. Não roda com NODE_ENV=production.',
    );
  }

  const connectionString = resolveDatabaseUrl('migration');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('[seed] iniciando seed demonstrativo (Rondonópolis/MT)…');

    const { rows: sourceRows } = await client.query<{ id: string }>(
      `INSERT INTO public.data_sources (id, internal_name, public_name, source_type)
       VALUES ($1, 'SEED_DEMO', 'Banco de Dados Posto Barato', 'MARKET_RESEARCH')
       ON CONFLICT (internal_name) DO UPDATE SET public_name = EXCLUDED.public_name
       RETURNING id`,
      [randomUUID()],
    );
    const dataSourceId = sourceRows[0]!.id;

    const productByCode = new Map<string, string>();
    for (const p of PRODUCTS) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO public.products (id, canonical_code, canonical_name, category, unit)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (canonical_code) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
         RETURNING id`,
        [randomUUID(), p.code, p.name, p.category, p.unit],
      );
      productByCode.set(p.code, rows[0]!.id);
    }

    // Idempotência: remove o demo anterior antes de recriar. Alcança só os
    // postos registrados em app.demo_stations — dado real do coletor, se houver
    // no mesmo banco, não é tocado.
    const { rows: previous } = await client.query<{ station_id: string }>(
      'SELECT station_id FROM app.demo_stations',
    );
    const previousIds = previous.map((r) => r.station_id);
    if (previousIds.length > 0) {
      await client.query('DELETE FROM public.price_observations WHERE station_id = ANY($1::uuid[])', [previousIds]);
      await client.query('DELETE FROM public.station_products WHERE station_id = ANY($1::uuid[])', [previousIds]);
      await client.query('DELETE FROM public.stations WHERE id = ANY($1::uuid[])', [previousIds]);
      await client.query('DELETE FROM app.demo_stations');
    }
    await client.query('DELETE FROM public.collection_runs WHERE host_name = $1', [DEMO_HOST]);

    const { rows: runRows } = await client.query<{ id: string }>(
      `INSERT INTO public.collection_runs
         (id, status, municipality, state, products_requested, collector_version, host_name, finished_at)
       VALUES (gen_random_uuid(), 'SUCCESS', $1, $2, '["demo"]'::jsonb, 'demo', $3, now())
       RETURNING id`,
      [RONDONOPOLIS.municipality, RONDONOPOLIS.state, DEMO_HOST],
    );
    const runId = runRows[0]!.id;

    const now = Date.now();
    const demoIds: string[] = [];

    for (const st of STATIONS) {
      const stationId = randomUUID();
      const observedAt = new Date(now - st.observedHoursAgo * 3600_000);
      // Coletado depois de observado, como na vida real: é o intervalo que faz a
      // ordenação por data de negócio diferir da ordenação por coleta.
      const collectedAt = new Date(observedAt.getTime() + 30 * 60_000);

      await client.query(
        `INSERT INTO public.stations
           (id, normalized_name, display_name, normalized_address, display_address,
            neighborhood, municipality, state, latitude, longitude, fingerprint,
            active, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $12)`,
        [
          stationId, st.name.toLowerCase(), st.name, st.address.toLowerCase(), st.address,
          st.neighborhood, RONDONOPOLIS.municipality, RONDONOPOLIS.state,
          st.lat, st.lng, slug(st.name, st.address), collectedAt,
        ],
      );
      demoIds.push(stationId);

      let position = 0;
      for (const [code, price] of Object.entries(st.prices)) {
        if (price === undefined) continue;
        const productId = productByCode.get(code);
        if (!productId) continue;
        await client.query(
          `INSERT INTO public.price_observations
             (id, station_id, product_id, data_source_id, collection_run_id,
              original_product_name, original_price_text, price_decimal, currency, unit,
              observed_at, estimated_time, collected_at, source_position,
              confidence_score, status, observation_fingerprint, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BRL', $9, $10, false, $11, $12, 0.9,
                   'APPROVED', $13, '{"demo":true}'::jsonb)`,
          [
            randomUUID(), stationId, productId, dataSourceId, runId,
            code, `R$ ${price.toFixed(2)}`, price, code === 'GNV' ? 'M3' : 'L',
            observedAt, collectedAt, position, slug(stationId, code),
          ],
        );
        await client.query(
          `INSERT INTO public.station_products (station_id, product_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [stationId, productId],
        );
        position += 1;
      }
    }

    await client.query(
      `INSERT INTO app.demo_stations (station_id, note)
       SELECT unnest($1::uuid[]), 'Rondonópolis/MT demo'`,
      [demoIds],
    );

    await refreshPublicPrices({ triggeredBy: 'seed', connectionString, retries: 0 });
    console.log(`[seed] ${STATIONS.length} postos demo criados e projeção atualizada.`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[seed] falhou:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
