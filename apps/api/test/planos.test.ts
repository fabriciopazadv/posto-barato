import { describe, expect, it } from 'vitest';
import { PRECOS_PADRAO, descreverPlano, listarPlanos } from '@posto-barato/domain';

describe('planos', () => {
  it('usa os preços do produto quando nada é sobrescrito', () => {
    expect(PRECOS_PADRAO).toEqual({ MENSAL: 999, SEMESTRAL: 4999, ANUAL: 8999 });
  });

  it('lista do ciclo mais longo para o mais curto', () => {
    expect(listarPlanos().map((p) => p.id)).toEqual(['ANUAL', 'SEMESTRAL', 'MENSAL']);
  });

  it('calcula o equivalente mensal para comparação honesta', () => {
    expect(descreverPlano('ANUAL').valorMensalCentavos).toBe(Math.round(8999 / 12));
    expect(descreverPlano('SEMESTRAL').valorMensalCentavos).toBe(Math.round(4999 / 6));
    expect(descreverPlano('MENSAL').valorMensalCentavos).toBe(999);
  });

  it('expressa a economia frente ao mensal, e zero no próprio mensal', () => {
    expect(descreverPlano('MENSAL').economiaPercent).toBe(0);
    expect(descreverPlano('ANUAL').economiaPercent).toBeGreaterThan(
      descreverPlano('SEMESTRAL').economiaPercent,
    );
  });

  it('aceita preços sobrescritos e recalcula tudo a partir deles', () => {
    const plano = descreverPlano('ANUAL', { MENSAL: 1200, ANUAL: 10800 });
    expect(plano.valorCentavos).toBe(10800);
    expect(plano.valorMensalCentavos).toBe(900);
    expect(plano.economiaPercent).toBe(25);
  });

  it('ignora sobrescrita inválida e cai no padrão', () => {
    expect(descreverPlano('MENSAL', { MENSAL: 0 }).valorCentavos).toBe(999);
    expect(descreverPlano('MENSAL', { MENSAL: Number.NaN }).valorCentavos).toBe(999);
  });
});
