/**
 * Regras do ciclo de cobrança — lógica pura, sem banco e sem rede, para ser
 * testável isoladamente.
 *
 * Espelha o sistema do mei-facil (outro produto do mesmo autor), com um plano
 * anual a mais. Sustenta três invariantes:
 *
 *  1. **Nenhuma cobrança nasce antes de os dias gratuitos serem usados.**
 *     `garantirCobrancaPermitida` é a trava, aplicada imediatamente antes de
 *     qualquer criação de cobrança no provedor.
 *  2. O teste grátis é concedido **uma única vez**, no cadastro, e seus marcos
 *     (`trialStartedAt`/`trialEndsAt`) nunca são reescritos depois.
 *  3. Sinal externo **nunca rebaixa** uma assinatura nem a devolve ao teste:
 *     reentrega de evento (o Asaas reenvia em caso de falha) não desfaz estado
 *     mais recente.
 */

import type { SubscriptionPlan, SubscriptionStatus } from '@posto-barato/shared-types';

/**
 * Os nomes locais mantêm o vocabulário do domínio em português; os tipos são os
 * do contrato público, para o servidor e o cliente não divergirem.
 */
export type StatusAssinatura = SubscriptionStatus;
export type Plano = SubscriptionPlan;

export const PLANOS: readonly Plano[] = ['MENSAL', 'SEMESTRAL', 'ANUAL'];

export function isPlano(valor: unknown): valor is Plano {
  return typeof valor === 'string' && (PLANOS as readonly string[]).includes(valor);
}

/**
 * Dias de teste grátis, contados do cadastro.
 *
 * 7 dias cobrem 2–4 abastecimentos do motorista médio — tempo de o usuário ver
 * economia real, que é quando o valor do app fica evidente. É bem menor que os
 * 31 dias do mei-facil de propósito: lá a obrigação do MEI é mensal, aqui o
 * ciclo de uso é semanal.
 */
export const TRIAL_DIAS = 7;

/**
 * Carência após o vencimento antes de cortar o acesso. Pix e boleto podem levar
 * dias úteis para compensar; 48h evitam derrubar quem já pagou.
 */
export const CARENCIA_HORAS = 48;

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

export const CARENCIA_MS = CARENCIA_HORAS * HORA_MS;

/** Meses de cada ciclo. */
export const CICLO_MESES: Record<Plano, number> = {
  MENSAL: 1,
  SEMESTRAL: 6,
  ANUAL: 12,
};

/** Ciclo correspondente na API de assinaturas do Asaas. */
export const CICLO_ASAAS: Record<Plano, 'MONTHLY' | 'SEMIANNUALLY' | 'YEARLY'> = {
  MENSAL: 'MONTHLY',
  SEMESTRAL: 'SEMIANNUALLY',
  ANUAL: 'YEARLY',
};

/** Fim do teste grátis a partir do instante do cadastro. */
export function fimDoTrial(cadastroEm: Date): Date {
  return new Date(cadastroEm.getTime() + TRIAL_DIAS * DIA_MS);
}

export function trialVigente(trialEndsAt: Date, agora: Date = new Date()): boolean {
  return trialEndsAt.getTime() > agora.getTime();
}

/**
 * Lançado quando algo tenta criar cobrança com dias gratuitos ainda por usar.
 * É erro de programação, não do usuário: significa que um caminho novo escapou
 * do fluxo (intenção durante o teste → cobrança na virada).
 */
export class CobrancaAntesDoTrialError extends Error {
  constructor(trialEndsAt: Date) {
    super(`Cobrança recusada: os dias gratuitos vão até ${trialEndsAt.toISOString()}.`);
    this.name = 'CobrancaAntesDoTrialError';
  }
}

/**
 * Trava da invariante 1 — chamar imediatamente antes de criar cobrança no
 * provedor de pagamento.
 */
export function garantirCobrancaPermitida(trialEndsAt: Date, agora: Date = new Date()): void {
  if (trialVigente(trialEndsAt, agora)) throw new CobrancaAntesDoTrialError(trialEndsAt);
}

/** Vencimento do ciclo seguinte, a partir de uma data-base. */
export function proximoVencimento(plano: Plano, base: Date): Date {
  const proximo = new Date(base);
  proximo.setMonth(proximo.getMonth() + CICLO_MESES[plano]);
  return proximo;
}

/**
 * Filtra as transições que um **sinal externo** pode aplicar ao status local —
 * tanto um webhook do provedor quanto a reconciliação diária, que consulta a
 * API do Asaas para corrigir estado quando um webhook se perde.
 *
 * - `TRIAL`, `TRIAL_EXPIRADO` e `AGUARDANDO_PAGAMENTO` nunca vêm de webhook:
 *   quem os define é o cadastro, o cron da virada e o fluxo de assinatura. Sem
 *   esta trava, uma reentrega de evento marcava um assinante em dia como TRIAL
 *   com `trialEndsAt` no passado — e o gate passava a bloqueá-lo.
 * - `ATIVA`: pagamento confirmado vale a partir de qualquer estado, menos de
 *   uma assinatura encerrada (pagamento tardio do último ciclo não a ressuscita).
 * - `INADIMPLENTE`: só onde existe cobrança em aberto.
 * - `CANCELADA`: encerramento é terminal e vale sempre.
 */
export function transicaoExternaPermitida(
  atual: StatusAssinatura,
  novo: StatusAssinatura,
): boolean {
  switch (novo) {
    case 'ATIVA':
      return atual !== 'CANCELADA';
    case 'INADIMPLENTE':
      return atual === 'TRIAL' || atual === 'AGUARDANDO_PAGAMENTO' || atual === 'ATIVA';
    case 'CANCELADA':
      return true;
    default:
      return false;
  }
}

/**
 * Data no formato `YYYY-MM-DD` esperado pelo Asaas, em horário de Brasília — o
 * `toISOString()` cru devolve a data em UTC, que vira o dia seguinte entre 21h
 * e 00h.
 */
export function dataEmSaoPaulo(quando: Date): string {
  return quando.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
