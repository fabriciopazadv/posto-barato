import { describe, expect, it } from 'vitest';
import {
  CICLO_ASAAS,
  CobrancaAntesDoTrialError,
  PLANOS,
  TRIAL_DIAS,
  dataEmSaoPaulo,
  fimDoTrial,
  garantirCobrancaPermitida,
  isPlano,
  proximoVencimento,
  transicaoExternaPermitida,
  trialVigente,
  type StatusAssinatura,
} from '@posto-barato/domain';

const DIA_MS = 24 * 60 * 60 * 1000;
const cadastro = new Date('2026-07-01T09:00:00Z');

describe('dias gratuitos', () => {
  it(`conta os ${TRIAL_DIAS} dias a partir do cadastro`, () => {
    expect(fimDoTrial(cadastro).getTime()).toBe(cadastro.getTime() + TRIAL_DIAS * DIA_MS);
  });

  it('vigora até o último instante e não além', () => {
    const fim = fimDoTrial(cadastro);
    expect(trialVigente(fim, new Date(fim.getTime() - 1))).toBe(true);
    expect(trialVigente(fim, fim)).toBe(false);
  });
});

// A invariante central do produto: nenhuma cobrança nasce enquanto houver dia
// grátis por usar, independentemente de quem chame o provedor de pagamento.
describe('garantirCobrancaPermitida — cobrança só após os dias gratuitos', () => {
  const fim = fimDoTrial(cadastro);

  it.each([
    ['no primeiro dia', 0],
    ['no meio do período', Math.floor(TRIAL_DIAS / 2)],
    ['no último dia', TRIAL_DIAS - 1],
  ])('recusa cobrança %s do teste', (_caso, dias) => {
    const agora = new Date(cadastro.getTime() + (dias as number) * DIA_MS);
    expect(() => garantirCobrancaPermitida(fim, agora)).toThrow(CobrancaAntesDoTrialError);
  });

  it('permite cobrança no instante em que o teste termina', () => {
    expect(() => garantirCobrancaPermitida(fim, fim)).not.toThrow();
  });

  it('permite cobrança depois do teste', () => {
    expect(() => garantirCobrancaPermitida(fim, new Date(fim.getTime() + DIA_MS))).not.toThrow();
  });
});

describe('proximoVencimento', () => {
  const base = new Date('2026-08-01T12:00:00Z');

  it('avança um mês no plano mensal', () => {
    expect(proximoVencimento('MENSAL', base).getMonth()).toBe(8); // setembro
  });

  it('avança seis meses no plano semestral', () => {
    const proximo = proximoVencimento('SEMESTRAL', base);
    expect(proximo.getFullYear()).toBe(2027);
    expect(proximo.getMonth()).toBe(1); // fevereiro
  });

  it('avança doze meses no plano anual', () => {
    const proximo = proximoVencimento('ANUAL', base);
    expect(proximo.getFullYear()).toBe(2027);
    expect(proximo.getMonth()).toBe(7); // agosto
  });

  it('não altera a data-base recebida', () => {
    const antes = base.getTime();
    proximoVencimento('ANUAL', base);
    expect(base.getTime()).toBe(antes);
  });
});

describe('planos', () => {
  it('reconhece os três planos e recusa o resto', () => {
    expect(PLANOS).toEqual(['MENSAL', 'SEMESTRAL', 'ANUAL']);
    expect(isPlano('ANUAL')).toBe(true);
    expect(isPlano('VITALICIO')).toBe(false);
    expect(isPlano(undefined)).toBe(false);
  });

  it('mapeia cada plano para o ciclo correspondente do Asaas', () => {
    expect(CICLO_ASAAS.MENSAL).toBe('MONTHLY');
    expect(CICLO_ASAAS.SEMESTRAL).toBe('SEMIANNUALLY');
    expect(CICLO_ASAAS.ANUAL).toBe('YEARLY');
  });
});

// Sem esta trava, uma reentrega de evento rebaixava assinante em dia.
describe('transicaoExternaPermitida — sinal externo nunca rebaixa', () => {
  const externos: StatusAssinatura[] = ['ATIVA', 'INADIMPLENTE', 'CANCELADA'];

  it('nunca aplica estados que só o app define', () => {
    const internos: StatusAssinatura[] = ['TRIAL', 'TRIAL_EXPIRADO', 'AGUARDANDO_PAGAMENTO'];
    for (const atual of [...externos, ...internos]) {
      for (const novo of internos) {
        expect(transicaoExternaPermitida(atual, novo)).toBe(false);
      }
    }
  });

  it('aceita pagamento confirmado de qualquer estado, menos de encerrada', () => {
    expect(transicaoExternaPermitida('TRIAL', 'ATIVA')).toBe(true);
    expect(transicaoExternaPermitida('AGUARDANDO_PAGAMENTO', 'ATIVA')).toBe(true);
    expect(transicaoExternaPermitida('INADIMPLENTE', 'ATIVA')).toBe(true);
    // Pagamento tardio do último ciclo não ressuscita assinatura encerrada.
    expect(transicaoExternaPermitida('CANCELADA', 'ATIVA')).toBe(false);
  });

  it('só marca inadimplente onde existe cobrança em aberto', () => {
    expect(transicaoExternaPermitida('ATIVA', 'INADIMPLENTE')).toBe(true);
    expect(transicaoExternaPermitida('AGUARDANDO_PAGAMENTO', 'INADIMPLENTE')).toBe(true);
    expect(transicaoExternaPermitida('TRIAL_EXPIRADO', 'INADIMPLENTE')).toBe(false);
    expect(transicaoExternaPermitida('CANCELADA', 'INADIMPLENTE')).toBe(false);
  });

  it('aceita encerramento a partir de qualquer estado', () => {
    for (const atual of externos) {
      expect(transicaoExternaPermitida(atual, 'CANCELADA')).toBe(true);
    }
  });
});

describe('dataEmSaoPaulo', () => {
  it('usa o dia em Brasília, não o dia em UTC', () => {
    // 23h em Brasília do dia 5 é 02h UTC do dia 6.
    expect(dataEmSaoPaulo(new Date('2026-08-06T02:00:00Z'))).toBe('2026-08-05');
  });
});
