/**
 * Gate de assinatura para rotas de recursos pagos.
 *
 * A consulta pública de preços e postos NUNCA passa por aqui: ver preço é o que
 * o app faz de graça. Este gate protege só o que o plano paga — alertas,
 * histórico longo, comparação avançada e economia acumulada.
 */
import { appDb } from '@posto-barato/database';
import { AssinaturaInativaError, assinaturaPermiteAcesso } from '@posto-barato/domain';

export { AssinaturaInativaError };

/**
 * Lança 402 estruturado (via o handler de erros) quando o acesso está
 * bloqueado. Use como preHandler nas rotas de recurso pago.
 */
export async function requireAssinaturaAtiva(userId: string): Promise<void> {
  const sub = await appDb().subscription.findUnique({
    where: { userId },
    select: {
      status: true,
      trialEndsAt: true,
      proximaCobrancaEm: true,
      inadimplenteDesde: true,
      acessoAte: true,
    },
  });

  if (!assinaturaPermiteAcesso(sub)) {
    throw new AssinaturaInativaError();
  }
}
