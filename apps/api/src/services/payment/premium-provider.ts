/** Abstração de provedor de pagamento (seção 16) — permite trocar de provedor
 * sem refatorar o núcleo. Nesta fase: só Premium vitalício, pagamento único. */
export interface PremiumCheckoutResult {
  url: string;
  simulated: boolean;
  providerCheckoutId: string | null;
}

export interface PremiumPaymentProvider {
  createCheckout(userId: string, purchaseId: string): Promise<PremiumCheckoutResult>;
}
