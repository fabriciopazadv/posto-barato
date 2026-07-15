import type { PremiumCheckoutResult, PremiumPaymentProvider } from './premium-provider.js';

export interface AsaasPremiumConfig {
  apiKey: string | undefined;
  env: 'sandbox' | 'production';
  appUrl: string;
  priceCents: number;
  label: string;
}

/**
 * Premium vitalício via Asaas Checkout hospedado, cobrança avulsa
 * (chargeType DETACHED — sem recorrência, ao contrário de uma assinatura
 * mensal). Aceita Pix e cartão. Sem ASAAS_API_KEY, roda em modo simulado
 * (útil para desenvolvimento/demonstração), como no mei-facil.
 */
export class AsaasPremiumProvider implements PremiumPaymentProvider {
  constructor(private readonly config: AsaasPremiumConfig) {}

  private get apiBaseUrl(): string {
    return this.config.env === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';
  }

  private get checkoutBaseUrl(): string {
    return this.config.env === 'production'
      ? 'https://www.asaas.com/checkoutSession/show'
      : 'https://sandbox.asaas.com/checkoutSession/show';
  }

  async createCheckout(userId: string, purchaseId: string): Promise<PremiumCheckoutResult> {
    if (!this.config.apiKey) {
      return {
        url: `${this.config.appUrl}/premium/sucesso?simulado=1&purchaseId=${purchaseId}`,
        simulated: true,
        providerCheckoutId: null,
      };
    }

    const res = await fetch(`${this.apiBaseUrl}/checkouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: this.config.apiKey },
      body: JSON.stringify({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        // DETACHED = cobrança avulsa (sem débito automático) — correta para
        // uma compra única, ao contrário de RECURRENT.
        chargeTypes: ['DETACHED'],
        callback: {
          successUrl: `${this.config.appUrl}/premium/sucesso`,
          cancelUrl: `${this.config.appUrl}/premium`,
          expiredUrl: `${this.config.appUrl}/premium`,
        },
        items: [
          {
            name: this.config.label.slice(0, 30),
            description: 'Acesso Premium vitalício, pagamento único.',
            quantity: 1,
            value: this.config.priceCents / 100,
          },
        ],
        // userId:purchaseId viaja até o webhook para correlacionar o pagamento.
        externalReference: `${userId}:${purchaseId}`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Falha ao criar checkout Asaas (${res.status}): ${detail}`);
    }

    const data = (await res.json()) as { id: string };
    return { url: `${this.checkoutBaseUrl}?id=${data.id}`, simulated: false, providerCheckoutId: data.id };
  }
}
