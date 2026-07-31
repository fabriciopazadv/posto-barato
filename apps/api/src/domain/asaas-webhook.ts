/**
 * Parsing puro dos eventos de webhook do Asaas (sem I/O), testável isolado.
 *
 * Modelo: assinatura recorrente. Os eventos tratados são:
 *
 *  - `SUBSCRIPTION_CREATED`            → grava os ids reais (sub_… / cus_…)
 *  - `PAYMENT_CONFIRMED` / `_RECEIVED` → cobrança paga (inclusive a 1ª)
 *  - `PAYMENT_OVERDUE`                 → INADIMPLENTE
 *  - `SUBSCRIPTION_DELETED`/`_INACTIVATED` → CANCELADA
 *
 * Nenhum evento concede ou reabre o teste grátis: quem faz isso é só o fluxo de
 * assinatura. Ver `transicaoExternaPermitida` em `@posto-barato/domain`.
 *
 * `externalReference` viaja como `"userId:plano"` (ver AsaasBillingProvider).
 */
import { isPlano, type Plano, type StatusAssinatura } from '@posto-barato/domain';

export interface AsaasRefs {
  asaasSubscriptionId: string | null;
  asaasCustomerId: string | null;
}

export type AsaasWebhookEvent =
  | { type: 'subscription_created'; userId: string | null; plano: Plano | null; refs: AsaasRefs }
  | {
      type: 'status';
      status: Extract<StatusAssinatura, 'ATIVA' | 'INADIMPLENTE' | 'CANCELADA'>;
      refs: AsaasRefs;
    }
  | { type: 'ignored' };

export function parseAsaasWebhook(body: Record<string, unknown>): AsaasWebhookEvent {
  const event = str(body.event) ?? '';

  if (event === 'SUBSCRIPTION_CREATED') {
    const subscription = obj(body.subscription) ?? body;
    const ref = parseExternalReference(
      str(subscription.externalReference) ?? str(body.externalReference),
    );
    return {
      type: 'subscription_created',
      userId: ref?.userId ?? null,
      plano: ref?.plano ?? null,
      refs: {
        asaasSubscriptionId: idOf(subscription.id),
        asaasCustomerId: idOf(subscription.customer),
      },
    };
  }

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    return { type: 'status', status: 'ATIVA', refs: refsDePagamento(body) };
  }

  if (event === 'PAYMENT_OVERDUE') {
    return { type: 'status', status: 'INADIMPLENTE', refs: refsDePagamento(body) };
  }

  if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
    const subscription = obj(body.subscription) ?? body;
    return {
      type: 'status',
      status: 'CANCELADA',
      refs: {
        asaasSubscriptionId: idOf(subscription.id),
        asaasCustomerId: idOf(subscription.customer),
      },
    };
  }

  return { type: 'ignored' };
}

function refsDePagamento(body: Record<string, unknown>): AsaasRefs {
  const payment = obj(body.payment) ?? body;
  return {
    asaasSubscriptionId: idOf(payment.subscription),
    asaasCustomerId: idOf(payment.customer),
  };
}

function parseExternalReference(ref: string | undefined): { userId: string; plano: Plano } | null {
  if (!ref) return null;
  const [userId, plano] = ref.split(':');
  if (!userId || !isPlano(plano)) return null;
  return { userId, plano };
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** customer/subscription podem vir como id (string) ou objeto `{ id }`. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const o = obj(value);
  return o && typeof o.id === 'string' ? o.id : null;
}
