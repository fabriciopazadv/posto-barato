import { describe, expect, it } from 'vitest';
import { parseAsaasWebhook } from '../src/domain/asaas-webhook.js';

describe('parseAsaasWebhook — assinatura criada', () => {
  it('extrai userId e plano do externalReference e os ids do Asaas', () => {
    const evento = parseAsaasWebhook({
      event: 'SUBSCRIPTION_CREATED',
      subscription: {
        id: 'sub_123',
        customer: 'cus_456',
        externalReference: 'user-abc:ANUAL',
      },
    });

    expect(evento).toEqual({
      type: 'subscription_created',
      userId: 'user-abc',
      plano: 'ANUAL',
      refs: { asaasSubscriptionId: 'sub_123', asaasCustomerId: 'cus_456' },
    });
  });

  it('aceita customer como objeto além de string', () => {
    const evento = parseAsaasWebhook({
      event: 'SUBSCRIPTION_CREATED',
      subscription: { id: 'sub_1', customer: { id: 'cus_1' }, externalReference: 'u:MENSAL' },
    });
    expect(evento.type).toBe('subscription_created');
    if (evento.type !== 'subscription_created') return;
    expect(evento.refs.asaasCustomerId).toBe('cus_1');
  });

  it('devolve plano nulo quando o externalReference traz um plano desconhecido', () => {
    const evento = parseAsaasWebhook({
      event: 'SUBSCRIPTION_CREATED',
      subscription: { id: 'sub_1', externalReference: 'user-abc:VITALICIO' },
    });
    expect(evento.type).toBe('subscription_created');
    if (evento.type !== 'subscription_created') return;
    expect(evento.userId).toBeNull();
    expect(evento.plano).toBeNull();
  });
});

describe('parseAsaasWebhook — status vindo do provedor', () => {
  it.each([
    ['PAYMENT_CONFIRMED', 'ATIVA'],
    ['PAYMENT_RECEIVED', 'ATIVA'],
    ['PAYMENT_OVERDUE', 'INADIMPLENTE'],
  ])('traduz %s para %s', (event, status) => {
    const evento = parseAsaasWebhook({
      event,
      payment: { subscription: 'sub_9', customer: 'cus_9' },
    });
    expect(evento).toEqual({
      type: 'status',
      status,
      refs: { asaasSubscriptionId: 'sub_9', asaasCustomerId: 'cus_9' },
    });
  });

  it.each(['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'])(
    'traduz %s para CANCELADA',
    (event) => {
      const evento = parseAsaasWebhook({
        event,
        subscription: { id: 'sub_7', customer: 'cus_7' },
      });
      expect(evento).toEqual({
        type: 'status',
        status: 'CANCELADA',
        refs: { asaasSubscriptionId: 'sub_7', asaasCustomerId: 'cus_7' },
      });
    },
  );

  it('aceita o pagamento no corpo raiz, sem envelope', () => {
    const evento = parseAsaasWebhook({
      event: 'PAYMENT_CONFIRMED',
      subscription: 'sub_raiz',
      customer: 'cus_raiz',
    });
    expect(evento.type).toBe('status');
    if (evento.type !== 'status') return;
    expect(evento.refs.asaasSubscriptionId).toBe('sub_raiz');
  });
});

describe('parseAsaasWebhook — eventos fora do escopo', () => {
  it.each(['CHECKOUT_PAID', 'PAYMENT_CREATED', 'TRANSFER_CREATED', ''])(
    'ignora %s',
    (event) => {
      expect(parseAsaasWebhook({ event })).toEqual({ type: 'ignored' });
    },
  );

  it('ignora corpo sem evento', () => {
    expect(parseAsaasWebhook({})).toEqual({ type: 'ignored' });
  });
});
