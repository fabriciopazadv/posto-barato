import { describe, expect, it } from 'vitest';
import {
  groupStations,
  PUBLIC_SOURCE,
  toPublicPrice,
  toStationDetail,
  type PublicPriceRow,
} from '../src/domain/projection.js';

const thresholds = { recentHours: 6, moderateHours: 24, oldHours: 72 };
const now = new Date('2026-07-14T12:00:00Z');

function row(overrides: Partial<PublicPriceRow>): PublicPriceRow {
  return {
    station_id: 's1',
    station_name: 'Posto Teste',
    station_address: 'Rua X, 1',
    neighborhood: 'Centro',
    municipality: 'Rondonópolis',
    state: 'MT',
    postal_code: null,
    latitude: -16.47,
    longitude: -54.63,
    is_demo: true,
    product_code: 'ETANOL',
    product_name: 'Etanol',
    price: '3.89',
    currency: 'BRL',
    unit: 'L',
    observed_at: new Date('2026-07-14T10:00:00Z'),
    observed_at_estimated: true,
    // Coletado depois de observado, como na vida real.
    collected_at: new Date('2026-07-14T10:30:00Z'),
    is_expired: false,
    confidence_score: '0.9',
    source_name: 'Banco de Dados Posto Barato',
    ...overrides,
  };
}

describe('toPublicPrice', () => {
  it('mapeia campos públicos e classifica frescor', () => {
    const price = toPublicPrice(row({}), thresholds, now);
    expect(price.price).toBe(3.89);
    expect(price.productCode).toBe('ETANOL');
    expect(price.ageMinutes).toBe(120);
    expect(price.freshness).toBe('RECENT');
    expect(price.confidence).toBe('HIGH');
  });

  it('mede a idade pela data de negócio, não pela coleta', () => {
    // Preço visto na bomba há 3 dias, recoletado agora há pouco. Medir pela
    // coleta diria "RECENT" e mostraria um preço de 3 dias como sendo de agora.
    const price = toPublicPrice(
      row({
        observed_at: new Date('2026-07-11T12:00:00Z'),
        collected_at: new Date('2026-07-14T11:30:00Z'),
      }),
      thresholds,
      now,
    );
    expect(price.ageMinutes).toBe(3 * 24 * 60);
    expect(price.freshness).toBe('OLD');
  });

  it('respeita o vencimento declarado pela fonte mesmo com preço recém-observado', () => {
    const price = toPublicPrice(row({ is_expired: true }), thresholds, now);
    expect(price.ageMinutes).toBe(120); // pelo relógio, seria RECENT
    expect(price.freshness).toBe('EXPIRED');
  });

  it('não expõe nenhum campo interno do coletor', () => {
    const price = toPublicPrice(row({}), thresholds, now);
    const keys = Object.keys(price);
    for (const forbidden of [
      'rawPayload', 'raw_payload', 'rawVisibleData', 'evidenceId', 'evidencePath',
      'fingerprint', 'observationFingerprint', 'sourceRecordHash', 'internalName',
      'cnpj', 'anpCode', 'collectionRunId',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe('groupStations', () => {
  it('agrupa por posto e escolhe o menor preço', () => {
    const rows = [
      row({ product_code: 'ETANOL', price: '3.99' }),
      row({ product_code: 'GASOLINA_COMUM', product_name: 'Gasolina comum', price: '5.79' }),
    ];
    const [station] = groupStations(rows, thresholds, now);
    expect(station!.prices).toHaveLength(2);
    expect(station!.lowestPrice?.productCode).toBe('ETANOL');
    expect(station!.lowestPrice?.price).toBe(3.99);
  });
});

describe('toStationDetail', () => {
  it('usa a fonte pública e inclui avisos obrigatórios', () => {
    const [summary] = groupStations([row({})], thresholds, now);
    const detail = toStationDetail(summary!, '78700-000');
    expect(detail.source).toBe(PUBLIC_SOURCE);
    expect(detail.source).toBe('Banco de Dados Posto Barato');
    expect(detail.notices.some((n) => n.includes('Confirme'))).toBe(true);
    expect(detail.notices).toContain('Dados demonstrativos.');
    expect(detail.postalCode).toBe('78700-000');
  });

  it('adiciona aviso quando há preço expirado', () => {
    const [summary] = groupStations(
      [row({ observed_at: new Date('2026-07-10T00:00:00Z') })],
      thresholds,
      now,
    );
    const detail = toStationDetail(summary!, null);
    expect(detail.notices.some((n) => n.includes('desatualizados'))).toBe(true);
  });
});
