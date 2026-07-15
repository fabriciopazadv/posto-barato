/**
 * Seed DEMONSTRATIVO da Fase 2 — Rondonópolis/MT (seção 35).
 *
 * Insere postos e observações fictícios no schema `collector` (como se tivessem
 * vindo da coleta) e registra seus ids em `app.demo_stations` para que a API os
 * rotule como "Dados demonstrativos". É idempotente: limpa o demo anterior antes
 * de recriar. NUNCA deve ser executado em produção com dados reais.
 *
 * Os postos/observações são inseridos via SQL parametrizado porque o seed atua
 * como "lado coletor" e precisa preencher colunas internas (fingerprint,
 * raw_visible_data, collection_run_id…) que os modelos Prisma da API — enxutos
 * de propósito — não declaram.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/index.js';
import { refreshPublicPrices } from '../src/refresh.js';

const DEMO_HOST = 'seed-demo';
const RONDONOPOLIS = { municipality: 'Rondonópolis', state: 'MT' };

const PRODUCTS = [
  { canonicalCode: 'ETANOL', canonicalName: 'Etanol', category: 'FUEL', unit: 'L' },
  { canonicalCode: 'ETANOL_ADITIVADO', canonicalName: 'Etanol aditivado', category: 'FUEL', unit: 'L' },
  { canonicalCode: 'GASOLINA_COMUM', canonicalName: 'Gasolina comum', category: 'FUEL', unit: 'L' },
  { canonicalCode: 'GASOLINA_ADITIVADA', canonicalName: 'Gasolina aditivada', category: 'FUEL', unit: 'L' },
  { canonicalCode: 'DIESEL_COMUM', canonicalName: 'Diesel comum', category: 'FUEL', unit: 'L' },
  { canonicalCode: 'DIESEL_S10', canonicalName: 'Diesel S-10', category: 'FUEL', unit: 'L' },
  { canonicalCode: 'GNV', canonicalName: 'GNV', category: 'FUEL', unit: 'M3' },
];

interface DemoStation {
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  /** horas atrás em que foi coletado (exercita as faixas de frescor). */
  collectedHoursAgo: number;
  prices: Partial<Record<string, number>>;
}

const STATIONS: DemoStation[] = [
  { name: 'Posto Centro Avenida', address: 'Av. Fernando Corrêa da Costa, 1200 - Centro', neighborhood: 'Centro',
    lat: -16.4707, lng: -54.6357, collectedHoursAgo: 2,
    prices: { ETANOL: 3.89, GASOLINA_COMUM: 5.79, GASOLINA_ADITIVADA: 5.99, DIESEL_S10: 5.99 } },
  { name: 'Auto Posto Vila Aurora', address: 'Av. Bandeirantes, 800 - Vila Aurora', neighborhood: 'Vila Aurora',
    lat: -16.4592, lng: -54.6301, collectedHoursAgo: 5,
    prices: { ETANOL: 3.79, GASOLINA_COMUM: 5.69, DIESEL_COMUM: 5.89, DIESEL_S10: 5.95 } },
  { name: 'Posto Jardim Tropical', address: 'R. Rio Branco, 55 - Jardim Tropical', neighborhood: 'Jardim Tropical',
    lat: -16.4801, lng: -54.6449, collectedHoursAgo: 10,
    prices: { ETANOL: 3.95, GASOLINA_COMUM: 5.85, GASOLINA_ADITIVADA: 6.05, GNV: 4.19 } },
  { name: 'Posto Rodoviária BR-364', address: 'BR-364, Km 12 - Distrito Industrial', neighborhood: 'Distrito Industrial',
    lat: -16.4419, lng: -54.6102, collectedHoursAgo: 20,
    prices: { GASOLINA_COMUM: 5.72, DIESEL_COMUM: 5.79, DIESEL_S10: 5.85, ETANOL: 3.85 } },
  { name: 'Posto Cidade Alta', address: 'Av. Lions Internacional, 2300 - Cidade Alta', neighborhood: 'Cidade Alta',
    lat: -16.4885, lng: -54.6218, collectedHoursAgo: 30,
    prices: { ETANOL: 3.99, GASOLINA_COMUM: 5.89, GASOLINA_ADITIVADA: 6.09 } },
  { name: 'Auto Posto Sagrada Família', address: 'R. Barão do Rio Branco, 900 - Sagrada Família', neighborhood: 'Sagrada Família',
    lat: -16.4650, lng: -54.6500, collectedHoursAgo: 48,
    prices: { ETANOL: 3.92, GASOLINA_COMUM: 5.82, DIESEL_S10: 5.92 } },
  { name: 'Posto Parque das Águas', address: 'Av. dos Estudantes, 400 - Parque das Águas', neighborhood: 'Parque das Águas',
    lat: -16.4990, lng: -54.6380, collectedHoursAgo: 80,
    prices: { GASOLINA_COMUM: 5.99, ETANOL: 4.05, DIESEL_S10: 6.09 } },
  { name: 'Posto Vila Operária', address: 'R. Dom Pedro II, 150 - Vila Operária', neighborhood: 'Vila Operária',
    lat: -16.4560, lng: -54.6420, collectedHoursAgo: 3,
    prices: { ETANOL: 3.83, GASOLINA_COMUM: 5.75, GASOLINA_ADITIVADA: 5.95, DIESEL_COMUM: 5.84, GNV: 4.09 } },
];

function slug(...parts: string[]): string {
  return parts.join('|').toLowerCase().replace(/\s+/g, '-');
}

async function main(): Promise<void> {
  console.log('[seed] iniciando seed demonstrativo (Rondonópolis/MT)…');

  const dataSource = await prisma.dataSource.upsert({
    where: { internalName: 'NOTA_MT_MARKET_RESEARCH' },
    update: {},
    create: {
      id: randomUUID(),
      internalName: 'NOTA_MT_MARKET_RESEARCH',
      publicName: 'Banco de Dados Posto Barato',
      sourceType: 'MARKET_RESEARCH',
    },
  });

  const productByCode = new Map<string, string>();
  for (const p of PRODUCTS) {
    const created = await prisma.product.upsert({
      where: { canonicalCode: p.canonicalCode },
      update: {},
      create: { id: randomUUID(), ...p },
    });
    productByCode.set(p.canonicalCode, created.id);
  }

  // Limpa demo anterior (idempotência).
  const previousDemo = await prisma.demoStation.findMany();
  const previousIds = previousDemo.map((d) => d.stationId);
  if (previousIds.length > 0) {
    await prisma.priceObservation.deleteMany({ where: { stationId: { in: previousIds } } });
    await prisma.station.deleteMany({ where: { id: { in: previousIds } } });
    await prisma.demoStation.deleteMany({});
  }
  await prisma.$executeRaw`DELETE FROM collector.collection_runs WHERE host_name = ${DEMO_HOST}`;

  const runRows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO collector.collection_runs
      (id, status, municipality, state, products_requested, collector_version, host_name, finished_at)
    VALUES
      (gen_random_uuid(), 'SUCCESS', ${RONDONOPOLIS.municipality}, ${RONDONOPOLIS.state},
       '["demo"]'::jsonb, 'demo', ${DEMO_HOST}, now())
    RETURNING id`;
  const runId = runRows[0]!.id;

  const now = Date.now();
  const demoIds: string[] = [];

  for (const st of STATIONS) {
    const stationId = randomUUID();
    const collectedAt = new Date(now - st.collectedHoursAgo * 3600_000);
    await prisma.$executeRaw`
      INSERT INTO collector.stations
        (id, normalized_name, display_name, normalized_address, display_address,
         neighborhood, municipality, state, latitude, longitude, fingerprint,
         active, first_seen_at, last_seen_at)
      VALUES
        (${stationId}::uuid, ${st.name.toLowerCase()}, ${st.name}, ${st.address.toLowerCase()},
         ${st.address}, ${st.neighborhood}, ${RONDONOPOLIS.municipality}, ${RONDONOPOLIS.state},
         ${st.lat}, ${st.lng}, ${slug(st.name, st.address)}, true, ${collectedAt}, ${collectedAt})`;
    demoIds.push(stationId);

    let position = 0;
    for (const [code, price] of Object.entries(st.prices)) {
      if (price === undefined) continue;
      const productId = productByCode.get(code);
      if (!productId) continue;
      const unit = code === 'GNV' ? 'M3' : 'L';
      await prisma.$executeRaw`
        INSERT INTO collector.price_observations
          (id, station_id, product_id, data_source_id, collection_run_id,
           original_product_name, original_price_text, price_decimal, currency, unit,
           estimated_observed_at, estimated_time, collected_at, source_position,
           confidence_score, observation_fingerprint, raw_visible_data)
        VALUES
          (${randomUUID()}::uuid, ${stationId}::uuid, ${productId}::uuid, ${dataSource.id}::uuid,
           ${runId}::uuid, ${code}, ${`R$ ${price.toFixed(2)}`}, ${price}, 'BRL', ${unit},
           ${collectedAt}, true, ${collectedAt}, ${position}, 0.9,
           ${slug(stationId, code)}, ${'{"demo":true}'}::jsonb)`;
      position += 1;
    }
  }

  await prisma.demoStation.createMany({
    data: demoIds.map((id) => ({ stationId: id, note: 'Rondonópolis/MT demo' })),
  });

  await refreshPublicPrices();
  console.log(`[seed] ${STATIONS.length} postos demo criados e matview atualizada.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err: unknown) => {
    console.error('[seed] falhou:', err);
    return prisma.$disconnect().finally(() => {
      process.exitCode = 1;
    });
  });
