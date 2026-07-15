import { prisma } from '@posto-barato/database';
import type { CheckoutResponse, PurchaseSummary } from '@posto-barato/shared-types';
import type { AppContext } from '../context.js';
import { AsaasPremiumProvider } from './payment/asaas-premium-provider.js';
import type { PremiumPaymentProvider } from './payment/premium-provider.js';

export class AlreadyPremiumError extends Error {
  constructor() {
    super('Esta conta já é Premium vitalício.');
    this.name = 'AlreadyPremiumError';
  }
}

function buildProvider(ctx: AppContext): PremiumPaymentProvider {
  return new AsaasPremiumProvider({
    apiKey: ctx.env.ASAAS_API_KEY,
    env: ctx.env.ASAAS_ENV,
    appUrl: ctx.env.APP_URL,
    priceCents: ctx.env.PREMIUM_PRICE_CENTS,
    label: ctx.env.PREMIUM_LABEL,
  });
}

export async function startPremiumCheckout(userId: string, ctx: AppContext): Promise<CheckoutResponse> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.premiumSince) throw new AlreadyPremiumError();

  const purchase = await prisma.purchase.create({
    data: { userId, amountCents: ctx.env.PREMIUM_PRICE_CENTS, status: 'PENDING' },
  });

  const provider = buildProvider(ctx);
  const { url, simulated, providerCheckoutId } = await provider.createCheckout(userId, purchase.id);

  if (providerCheckoutId) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { providerCheckoutId },
    });
  }

  if (simulated) {
    // Modo demonstração/dev sem credenciais reais: confirma na hora, como o
    // mei-facil faz ao iniciar o trial sem ASAAS_API_KEY configurada.
    await confirmPurchase(purchase.id);
  }

  return { checkoutUrl: url, purchaseId: purchase.id, simulated };
}

/** Idempotente: marcar como pago uma compra já paga não tem efeito colateral. */
export async function confirmPurchase(purchaseId: string, providerPaymentId?: string | null): Promise<void> {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase || purchase.status === 'PAID') return;

  await prisma.$transaction([
    prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        ...(providerPaymentId ? { providerPaymentId } : {}),
      },
    }),
    prisma.user.updateMany({
      where: { id: purchase.userId, premiumSince: null },
      data: { premiumSince: new Date() },
    }),
  ]);
}

/** Usado pelo webhook quando só temos providerCheckoutId (evento PAYMENT_CONFIRMED). */
export async function confirmPurchaseByCheckoutId(
  providerCheckoutId: string,
  providerPaymentId: string | null,
): Promise<void> {
  const purchase = await prisma.purchase.findFirst({ where: { providerCheckoutId } });
  if (!purchase) return;
  await confirmPurchase(purchase.id, providerPaymentId);
}

export async function listPurchases(userId: string): Promise<PurchaseSummary[]> {
  const purchases = await prisma.purchase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return purchases.map((p) => ({
    id: p.id,
    status: p.status,
    amountCents: p.amountCents,
    currency: p.currency,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }));
}
