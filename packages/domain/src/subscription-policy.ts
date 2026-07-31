/**
 * Gate de assinatura (paywall) — lógica pura, sem banco, para ser testável
 * isoladamente.
 *
 * A consulta pública de preços NUNCA passa por este gate: ver preço de posto é
 * o que o app faz de graça, e é o caminho que não pode ser bloqueado. O gate
 * protege apenas os recursos do plano pago (alertas, histórico longo,
 * comparação avançada, economia acumulada).
 */

import { CARENCIA_MS, type StatusAssinatura } from './billing-policy.js';

export type EstadoAssinatura = {
  status: StatusAssinatura;
  trialEndsAt: Date;
  /** Vencimento da cobrança em aberto — limita o acesso em AGUARDANDO_PAGAMENTO. */
  proximaCobrancaEm?: Date | null;
  /** Início da carência de 48h aberta pelo aviso de vencimento. */
  inadimplenteDesde?: Date | null;
  /** Cancelada: até quando o período já pago ainda vale. */
  acessoAte?: Date | null;
} | null;

/**
 * Libera os recursos pagos enquanto o cliente está em dia com o combinado:
 *
 * - `ATIVA`: assinatura paga.
 * - `TRIAL`: durante os dias grátis.
 * - `AGUARDANDO_PAGAMENTO`: a 1ª cobrança acabou de ser emitida; o acesso segue
 *   até 48h depois do vencimento, para Pix e boleto compensarem sem derrubar
 *   ninguém. Limitado no tempo de propósito — se o webhook de vencimento nunca
 *   chegar, o acesso fecha sozinho em vez de ficar aberto para sempre.
 * - `INADIMPLENTE`: mesma carência de 48h, contada do vencimento notificado.
 * - `CANCELADA`: até o fim do período já pago (`acessoAte`) — quem pagou o
 *   ciclo usa o ciclo. Sem período pago rastreável, bloqueia.
 *
 * Bloqueia `TRIAL_EXPIRADO`: dias grátis usados, sem plano escolhido.
 */
export function assinaturaPermiteAcesso(
  sub: EstadoAssinatura,
  agora: Date = new Date(),
): boolean {
  if (!sub) return false;

  switch (sub.status) {
    case 'ATIVA':
      return true;
    case 'TRIAL':
      return sub.trialEndsAt.getTime() > agora.getTime();
    case 'AGUARDANDO_PAGAMENTO':
      return dentroDaCarencia(sub.proximaCobrancaEm ?? sub.trialEndsAt, agora);
    case 'INADIMPLENTE':
      // Sem marco de início (assinatura migrada), a carência não se aplica.
      return sub.inadimplenteDesde ? dentroDaCarencia(sub.inadimplenteDesde, agora) : false;
    case 'CANCELADA':
      return sub.acessoAte ? agora.getTime() < sub.acessoAte.getTime() : false;
    case 'TRIAL_EXPIRADO':
      return false;
  }
}

function dentroDaCarencia(marco: Date, agora: Date): boolean {
  return agora.getTime() < marco.getTime() + CARENCIA_MS;
}

export class AssinaturaInativaError extends Error {
  constructor() {
    super('Sua assinatura não está ativa.');
    this.name = 'AssinaturaInativaError';
  }
}
