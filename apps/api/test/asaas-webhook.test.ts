import { describe, expect, it } from 'vitest';
import { parseAsaasWebhook } from '../src/domain/asaas-webhook.js';

describe('parseAsaasWebhook', () => {
  it('CHECKOUT_PAID com externalReference válido vira checkout_paid', () => {
    const event = parseAsaasWebhook({
      event: 'CHECKOUT_PAID',
      checkout: { id: 'checkout_123', externalReference: 'user-1:purchase-1' },
    });
    expect(event).toEqual({
      type: 'checkout_paid',
      userId: 'user-1',
      purchaseId: 'purchase-1',
      checkoutId: 'checkout_123',
      paymentId: null,
    });
  });

  it('CHECKOUT_PAID sem externalReference é ignorado', () => {
    const event = parseAsaasWebhook({ event: 'CHECKOUT_PAID', checkout: { id: 'x' } });
    expect(event).toEqual({ type: 'ignored' });
  });

  it('PAYMENT_CONFIRMED extrai checkoutId e paymentId', () => {
    const event = parseAsaasWebhook({
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_1', checkoutSession: 'checkout_123' },
    });
    expect(event).toEqual({ type: 'payment_confirmed', checkoutId: 'checkout_123', paymentId: 'pay_1' });
  });

  it('PAYMENT_RECEIVED é tratado igual a PAYMENT_CONFIRMED', () => {
    const event = parseAsaasWebhook({
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_2', checkoutSession: 'checkout_456' },
    });
    expect(event.type).toBe('payment_confirmed');
  });

  it('evento desconhecido é ignorado', () => {
    expect(parseAsaasWebhook({ event: 'SOMETHING_ELSE' })).toEqual({ type: 'ignored' });
  });

  it('corpo vazio é ignorado sem lançar', () => {
    expect(parseAsaasWebhook({})).toEqual({ type: 'ignored' });
  });
});
