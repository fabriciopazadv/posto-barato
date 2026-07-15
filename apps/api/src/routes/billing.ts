import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PremiumOffer } from '@posto-barato/shared-types';
import type { AppContext } from '../context.js';
import { badRequest, notFound } from '../plugins/errors.js';
import { parseAsaasWebhook } from '../domain/asaas-webhook.js';
import {
  AlreadyPremiumError,
  confirmPurchase,
  confirmPurchaseByCheckoutId,
  listPurchases,
  startPremiumCheckout,
} from '../services/billing.service.js';

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function registerBillingRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    '/billing/offer',
    { schema: { tags: ['billing'], summary: 'Preço do Premium vitalício' } },
    async (): Promise<PremiumOffer> => ({
      amountCents: ctx.env.PREMIUM_PRICE_CENTS,
      currency: 'BRL',
      label: ctx.env.PREMIUM_LABEL,
    }),
  );

  app.post(
    '/billing/checkout',
    {
      schema: { tags: ['billing'], summary: 'Inicia a compra do Premium vitalício' },
      preHandler: app.requireAuth,
    },
    async (request) => {
      try {
        return await startPremiumCheckout(request.user!.id, ctx);
      } catch (err) {
        if (err instanceof AlreadyPremiumError) throw badRequest(err.message);
        throw err;
      }
    },
  );

  app.get(
    '/billing/purchases',
    {
      schema: { tags: ['billing'], summary: 'Histórico de compras da conta' },
      preHandler: app.requireAuth,
    },
    async (request) => ({ data: await listPurchases(request.user!.id) }),
  );

  app.post(
    '/billing/webhook',
    { schema: { tags: ['billing'], summary: 'Webhook do Asaas (pagamento do Premium)' } },
    async (request, reply) => {
      if (!ctx.env.ASAAS_API_KEY) {
        throw notFound('Webhook não configurado.');
      }
      if (ctx.env.ASAAS_WEBHOOK_TOKEN) {
        const received = request.headers['asaas-access-token'];
        if (typeof received !== 'string' || !tokensMatch(received, ctx.env.ASAAS_WEBHOOK_TOKEN)) {
          reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Token inválido.' } });
          return;
        }
      }

      const body = request.body;
      if (!body || typeof body !== 'object') {
        throw badRequest('Corpo do webhook inválido.');
      }

      const event = parseAsaasWebhook(body as Record<string, unknown>);
      if (event.type === 'checkout_paid') {
        await confirmPurchase(event.purchaseId, event.paymentId ?? undefined);
      } else if (event.type === 'payment_confirmed' && event.checkoutId) {
        await confirmPurchaseByCheckoutId(event.checkoutId, event.paymentId);
      }

      reply.send({ received: true });
    },
  );
}
