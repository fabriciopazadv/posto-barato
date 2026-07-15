/**
 * Gate de acesso Premium — lógica pura, sem banco, para ser testável
 * isoladamente (mesmo princípio do mei-facil: nunca acoplar a regra de
 * negócio ao acesso a dados).
 *
 * Diferente de uma assinatura recorrente, aqui não há trial nem
 * cancelamento: `premiumSince` não nulo significa Premium para sempre,
 * porque a compra é única (vitalícia).
 */
export interface UserPremiumState {
  premiumSince: Date | null;
}

export function isPremium(user: UserPremiumState): boolean {
  return user.premiumSince !== null;
}

export class PremiumRequiredError extends Error {
  constructor() {
    super('Este recurso é exclusivo do Premium vitalício.');
    this.name = 'PremiumRequiredError';
  }
}

export function requirePremium(user: UserPremiumState): void {
  if (!isPremium(user)) {
    throw new PremiumRequiredError();
  }
}
