/**
 * Parsing puro dos eventos de webhook do Asaas (sem I/O), testável isolado —
 * mesmo princípio do mei-facil. Modelo aqui é pagamento único (chargeType
 * DETACHED), bem mais simples que uma assinatura recorrente: não há
 * `subscription`, apenas `checkout` e `payment`.
 *
 * externalReference viaja como "userId:purchaseId" (ver AsaasPremiumProvider).
 */

export type AsaasWebhookEvent =
  | { type: 'checkout_paid'; userId: string; purchaseId: string; checkoutId: string | null; paymentId: string | null }
  | { type: 'payment_confirmed'; checkoutId: string | null; paymentId: string | null }
  | { type: 'ignored' };

export function parseAsaasWebhook(body: Record<string, unknown>): AsaasWebhookEvent {
  const event = str(body.event) ?? '';

  if (event === 'CHECKOUT_PAID') {
    const checkout = obj(body.checkout);
    const payment = obj(body.payment);
    const ref = parseExternalReference(str(checkout?.externalReference) ?? str(body.externalReference));
    if (!ref) return { type: 'ignored' };
    return {
      type: 'checkout_paid',
      userId: ref.userId,
      purchaseId: ref.purchaseId,
      checkoutId: str(checkout?.id) ?? null,
      paymentId: payment ? idOf(payment.id) : null,
    };
  }

  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    const payment = obj(body.payment) ?? body;
    return {
      type: 'payment_confirmed',
      checkoutId: str(payment.checkoutSession) ?? null,
      paymentId: str(payment.id) ?? null,
    };
  }

  return { type: 'ignored' };
}

function parseExternalReference(ref: string | undefined): { userId: string; purchaseId: string } | null {
  if (!ref) return null;
  const [userId, purchaseId] = ref.split(':');
  if (!userId || !purchaseId) return null;
  return { userId, purchaseId };
}

function obj(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const o = obj(value);
  return o && typeof o.id === 'string' ? o.id : null;
}
