import { describe, expect, it } from 'vitest';
import {
  CARENCIA_MS,
  assinaturaPermiteAcesso,
  type EstadoAssinatura,
} from '@posto-barato/domain';

const agora = new Date('2026-08-10T12:00:00Z');
const futuro = new Date(agora.getTime() + 86_400_000);
const passado = new Date(agora.getTime() - 86_400_000);

function estado(parcial: Partial<NonNullable<EstadoAssinatura>>): EstadoAssinatura {
  return { status: 'TRIAL', trialEndsAt: futuro, ...parcial };
}

describe('assinaturaPermiteAcesso (gate/paywall)', () => {
  it('libera assinatura ATIVA', () => {
    expect(assinaturaPermiteAcesso(estado({ status: 'ATIVA' }), agora)).toBe(true);
  });

  it('libera TRIAL dentro do prazo', () => {
    expect(assinaturaPermiteAcesso(estado({ status: 'TRIAL', trialEndsAt: futuro }), agora)).toBe(
      true,
    );
  });

  it('bloqueia TRIAL vencido', () => {
    expect(assinaturaPermiteAcesso(estado({ status: 'TRIAL', trialEndsAt: passado }), agora)).toBe(
      false,
    );
  });

  it('bloqueia TRIAL_EXPIRADO', () => {
    expect(assinaturaPermiteAcesso(estado({ status: 'TRIAL_EXPIRADO' }), agora)).toBe(false);
  });

  it('bloqueia quando não há assinatura', () => {
    expect(assinaturaPermiteAcesso(null, agora)).toBe(false);
  });
});

describe('cancelamento preserva o período já pago', () => {
  it('mantém o acesso até acessoAte', () => {
    expect(
      assinaturaPermiteAcesso(estado({ status: 'CANCELADA', acessoAte: futuro }), agora),
    ).toBe(true);
  });

  it('bloqueia depois que o período pago termina', () => {
    expect(
      assinaturaPermiteAcesso(estado({ status: 'CANCELADA', acessoAte: passado }), agora),
    ).toBe(false);
  });

  it('bloqueia cancelada sem período pago a preservar', () => {
    expect(assinaturaPermiteAcesso(estado({ status: 'CANCELADA', acessoAte: null }), agora)).toBe(
      false,
    );
  });
});

describe('carência de 48h', () => {
  it('mantém o acesso de quem acabou de ficar inadimplente', () => {
    const inadimplenteDesde = new Date(agora.getTime() - 3600_000);
    expect(
      assinaturaPermiteAcesso(estado({ status: 'INADIMPLENTE', inadimplenteDesde }), agora),
    ).toBe(true);
  });

  it('corta o acesso passadas as 48h', () => {
    const inadimplenteDesde = new Date(agora.getTime() - CARENCIA_MS - 1000);
    expect(
      assinaturaPermiteAcesso(estado({ status: 'INADIMPLENTE', inadimplenteDesde }), agora),
    ).toBe(false);
  });

  it('bloqueia inadimplente sem marco de início (assinatura migrada)', () => {
    expect(
      assinaturaPermiteAcesso(estado({ status: 'INADIMPLENTE', inadimplenteDesde: null }), agora),
    ).toBe(false);
  });

  it('mantém o acesso enquanto a 1ª cobrança recém-emitida não vence', () => {
    expect(
      assinaturaPermiteAcesso(
        estado({ status: 'AGUARDANDO_PAGAMENTO', proximaCobrancaEm: futuro }),
        agora,
      ),
    ).toBe(true);
  });

  // Se o aviso de vencimento nunca chegar, o acesso fecha sozinho em vez de
  // ficar aberto para sempre.
  it('fecha o acesso 48h após o vencimento mesmo sem aviso do provedor', () => {
    const venceu = new Date(agora.getTime() - CARENCIA_MS - 1000);
    expect(
      assinaturaPermiteAcesso(
        estado({ status: 'AGUARDANDO_PAGAMENTO', proximaCobrancaEm: venceu }),
        agora,
      ),
    ).toBe(false);
  });

  it('sem proximaCobrancaEm, mede a carência a partir do fim do teste', () => {
    const trialEndsAt = new Date(agora.getTime() - CARENCIA_MS - 1000);
    expect(
      assinaturaPermiteAcesso(
        estado({ status: 'AGUARDANDO_PAGAMENTO', trialEndsAt, proximaCobrancaEm: null }),
        agora,
      ),
    ).toBe(false);
  });
});
