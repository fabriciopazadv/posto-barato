/**
 * Serviço de assinatura do Premium.
 *
 * Espelha o desenho do mei-facil: as regras vivem em `@posto-barato/domain`
 * (puras, testáveis) e aqui fica só a orquestração com banco e provedor.
 */
import { appDb, type Prisma, type Subscription } from '@posto-barato/database';
import {
  DocumentoInvalidoError,
  assinaturaPermiteAcesso,
  documentoValido,
  fimDoTrial,
  mascararDocumento,
  normalizarDocumento,
  proximoVencimento,
  transicaoExternaPermitida,
  trialVigente,
  type Plano,
  type StatusAssinatura,
} from '@posto-barato/domain';
import type { SubscriptionSummary } from '@posto-barato/shared-types';
import type { AppContext } from '../context.js';
import { AsaasBillingProvider } from './payment/asaas-billing-provider.js';

const DIA_MS = 24 * 60 * 60 * 1000;

export class SubscriptionNotFoundError extends Error {
  constructor() {
    super('Assinatura não encontrada.');
    this.name = 'SubscriptionNotFoundError';
  }
}

export { DocumentoInvalidoError };

export function buildProvider(ctx: AppContext): AsaasBillingProvider {
  return new AsaasBillingProvider({
    apiKey: ctx.env.ASAAS_API_KEY,
    ambiente: ctx.env.ASAAS_ENV,
    producao: ctx.env.NODE_ENV === 'production',
    precos: ctx.precos,
  });
}

/**
 * Cria a assinatura em TRIAL. Chamado uma única vez, no cadastro — os marcos do
 * teste nunca são reescritos depois, e é isso que impede alguém de ganhar dias
 * grátis de novo.
 */
export async function createTrialSubscription(
  userId: string,
  cadastroEm: Date = new Date(),
): Promise<void> {
  await appDb().subscription.create({
    data: {
      userId,
      status: 'TRIAL',
      trialStartedAt: cadastroEm,
      trialEndsAt: fimDoTrial(cadastroEm),
    },
  });
}

export function toSummary(sub: Subscription, agora: Date = new Date()): SubscriptionSummary {
  const restante = Math.ceil((sub.trialEndsAt.getTime() - agora.getTime()) / DIA_MS);

  return {
    status: sub.status as StatusAssinatura,
    plano: sub.plano ?? null,
    planoEscolhido: sub.planoEscolhido ?? null,
    valorCentavos: sub.valorCentavos ?? null,
    trialEndsAt: sub.trialEndsAt.toISOString(),
    proximaCobrancaEm: sub.proximaCobrancaEm?.toISOString() ?? null,
    ultimoPagamentoEm: sub.ultimoPagamentoEm?.toISOString() ?? null,
    canceladaEm: sub.canceladaEm?.toISOString() ?? null,
    acessoAte: sub.acessoAte?.toISOString() ?? null,
    acessoLiberado: assinaturaPermiteAcesso(sub, agora),
    diasRestantesTrial: sub.status === 'TRIAL' && restante > 0 ? restante : 0,
    // Só a máscara sai do servidor: a tela precisa saber se já há documento (e
    // mostrar qual, o bastante para a pessoa reconhecer), não do número inteiro.
    cpfCnpjMascarado: mascararDocumento(sub.cpfCnpjPagador),
  };
}

export async function getSubscription(userId: string): Promise<SubscriptionSummary | null> {
  const sub = await appDb().subscription.findUnique({ where: { userId } });
  return sub ? toSummary(sub) : null;
}

/**
 * Assinar tem dois desfechos, decididos pelos dias gratuitos:
 *
 *  - **Teste vigente** → registra o plano escolhido e o documento do pagador, e
 *    encerra. Nenhuma cobrança é criada; ela nasce na virada do teste, pelo
 *    cron. É o que garante que a cobrança só é efetivada depois de os dias
 *    grátis serem usados.
 *  - **Teste já usado** (TRIAL_EXPIRADO, INADIMPLENTE, CANCELADA) → cria a
 *    cobrança na hora, com vencimento hoje.
 *
 * Em ambos o CPF/CNPJ é exigido, e é essa a diferença que torna a virada
 * automática: antes o documento só era pedido quando a cobrança nascia na hora,
 * então o cron chegava na virada sem ele, falhava, e a pessoa ficava bloqueada
 * até voltar à tela para assinar de novo.
 */
export async function subscribe(
  userId: string,
  plano: Plano,
  cpfCnpjInformado: string | undefined,
  ctx: AppContext,
): Promise<{ efeito: 'plano_registrado' | 'cobranca_criada'; cobrancaEm: Date; simulado: boolean }> {
  const sub = await appDb().subscription.findUnique({
    where: { userId },
    select: { trialEndsAt: true, status: true, cpfCnpjPagador: true },
  });
  if (!sub) throw new SubscriptionNotFoundError();

  const provider = buildProvider(ctx);

  // Documento digitado errado é recusado na hora, e nunca cai de volta no que
  // estava guardado: quem informou um documento novo espera que seja ele o
  // cobrado, não o antigo.
  const informado = (cpfCnpjInformado ?? '').trim();
  if (informado && !documentoValido(informado)) throw new DocumentoInvalidoError();

  // Sem documento novo vale o já guardado — quem só troca de plano não precisa
  // digitar de novo.
  const cpfCnpj = normalizarDocumento(informado) ?? sub.cpfCnpjPagador;
  // No modo real o Asaas exige CPF ou CNPJ para criar o cliente. No modo
  // simulado (sem chave, fora de produção) seguir sem documento é aceitável —
  // não há cliente a criar em lugar nenhum.
  if (provider.configurado && !cpfCnpj) {
    throw new DocumentoInvalidoError();
  }

  // ── Caminho 1: ainda há dias grátis por usar ────────────────────────────
  if (sub.status === 'TRIAL' && trialVigente(sub.trialEndsAt)) {
    const { cobrancaEm } = await provider.registrarIntencao(userId, plano, cpfCnpj);
    return { efeito: 'plano_registrado', cobrancaEm, simulado: false };
  }

  // ── Caminho 2: dias grátis já usados — cobrança criada agora ────────────
  const user = await appDb().user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true },
  });

  const { simulado, vencimento } = await provider.criarCobranca(userId, plano, {
    nome: user.name ?? 'Cliente Posto Barato',
    email: user.email,
    cpfCnpj: cpfCnpj ?? '',
  });

  return { efeito: 'cobranca_criada', cobrancaEm: vencimento, simulado };
}

/**
 * Cancelamento pelo próprio cliente — cancelar precisa ser tão fácil quanto
 * contratar (CDC art. 49 e Decreto 7.962/2013).
 *
 * O acesso **não** é cortado na hora: quem pagou o ciclo usa o ciclo até o fim
 * (`acessoAte`). Quem cancela durante o teste segue com os dias grátis que
 * restam — e sem cobrança nenhuma, porque ela nunca chegou a ser criada.
 */
export async function cancelSubscription(
  userId: string,
  ctx: AppContext,
): Promise<{ acessoAte: Date | null; jaCancelada: boolean }> {
  const sub = await appDb().subscription.findUnique({ where: { userId } });
  if (!sub) throw new SubscriptionNotFoundError();
  if (sub.status === 'CANCELADA') {
    return { acessoAte: sub.acessoAte, jaCancelada: true };
  }

  // Para o Asaas de emitir as próximas cobranças. Falha aqui aborta o
  // cancelamento: pior que não cancelar é dizer que cancelou e seguir cobrando.
  if (sub.asaasSubscriptionId) {
    await buildProvider(ctx).cancelarNoAsaas(sub.asaasSubscriptionId);
  }

  const agora = new Date();
  const emTeste = sub.status === 'TRIAL' && trialVigente(sub.trialEndsAt, agora);

  if (emTeste) {
    // Ainda em teste: nenhuma cobrança existiu. Some a intenção de assinatura e
    // os dias grátis restantes seguem valendo. O documento vai junto: sem
    // cobrança à vista não há por que o app seguir guardando o CPF de alguém.
    await appDb().subscription.update({
      where: { userId },
      data: {
        planoEscolhido: null,
        valorCentavos: null,
        asaasSubscriptionId: null,
        cpfCnpjPagador: null,
      },
    });
    return { acessoAte: sub.trialEndsAt, jaCancelada: false };
  }

  const acessoAte = fimDoPeriodoPago(sub, agora);
  await appDb().subscription.update({
    where: { userId },
    data: { status: 'CANCELADA', canceladaEm: agora, acessoAte, planoEscolhido: null },
  });

  return { acessoAte, jaCancelada: false };
}

/**
 * Até quando um cancelamento ainda vale: o vencimento do próximo ciclo, quando
 * houve pagamento e ele está no futuro. Sem pagamento rastreável, nada a
 * preservar.
 */
function fimDoPeriodoPago(
  sub: { ultimoPagamentoEm: Date | null; proximaCobrancaEm: Date | null },
  agora: Date,
): Date | null {
  const fim = sub.proximaCobrancaEm;
  if (!sub.ultimoPagamentoEm || !fim) return null;
  return fim.getTime() > agora.getTime() ? fim : null;
}

// ---------------------------------------------------------------------------
// Sinal externo (webhook e reconciliação)
// ---------------------------------------------------------------------------

export interface RefsAsaas {
  asaasSubscriptionId: string | null;
  asaasCustomerId: string | null;
}

/**
 * Registra o evento antes de agir. Devolve false quando ele já tinha sido
 * processado — o Asaas reentrega em caso de falha, e sem esta trava a segunda
 * entrega reprocessaria o mesmo pagamento.
 */
export async function registerBillingEvent(
  id: string,
  evento: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await appDb().billingEvent.create({
      data: { id, evento, payload: payload as Prisma.InputJsonValue },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Localiza a assinatura pelos identificadores do Asaas, do mais específico para
 * o menos. Devolve o registro para a transição ser decidida com o estado atual
 * em mãos, em vez de sobrescrever às cegas.
 */
async function localizarAssinatura(refs: RefsAsaas): Promise<Subscription | null> {
  if (refs.asaasSubscriptionId) {
    const s = await appDb().subscription.findFirst({
      where: { asaasSubscriptionId: refs.asaasSubscriptionId },
    });
    if (s) return s;
  }
  if (refs.asaasCustomerId) {
    return appDb().subscription.findFirst({ where: { asaasCustomerId: refs.asaasCustomerId } });
  }
  return null;
}

/**
 * Aplica o novo status quando a transição é permitida a partir do estado atual
 * (ver `transicaoExternaPermitida`) — reentrega de evento antigo não desfaz um
 * estado mais recente. Aproveita para gravar os ids reais que ainda faltem.
 */
export async function applyExternalStatus(
  refs: RefsAsaas,
  status: Extract<StatusAssinatura, 'ATIVA' | 'INADIMPLENTE' | 'CANCELADA'>,
): Promise<'aplicado' | 'ignorado' | 'nao_encontrado'> {
  const sub = await localizarAssinatura(refs);
  if (!sub) return 'nao_encontrado';
  if (!transicaoExternaPermitida(sub.status as StatusAssinatura, status)) return 'ignorado';

  const agora = new Date();
  const plano: Plano = (sub.planoEscolhido ?? sub.plano ?? 'MENSAL') as Plano;

  await appDb().subscription.update({
    where: { id: sub.id },
    data: {
      status,
      // Cada estado carrega o marco de tempo que o gate usa para medir carência
      // e que a UI usa para dizer quando é a próxima cobrança.
      ...(status === 'ATIVA'
        ? {
            plano,
            ultimoPagamentoEm: agora,
            proximaCobrancaEm: proximoVencimento(plano, agora),
            inadimplenteDesde: null,
          }
        : {}),
      // Não reinicia a carência a cada novo aviso: quem já está inadimplente
      // não ganha mais 48h por causa de uma segunda cobrança vencida.
      ...(status === 'INADIMPLENTE' && !sub.inadimplenteDesde ? { inadimplenteDesde: agora } : {}),
      // Cancelamento vindo do provedor preserva o período já pago.
      ...(status === 'CANCELADA'
        ? { canceladaEm: agora, acessoAte: fimDoPeriodoPago(sub, agora) }
        : {}),
      ...(refs.asaasSubscriptionId ? { asaasSubscriptionId: refs.asaasSubscriptionId } : {}),
      ...(refs.asaasCustomerId ? { asaasCustomerId: refs.asaasCustomerId } : {}),
    },
  });

  return 'aplicado';
}

/** Vincula os ids do Asaas a partir do externalReference `userId:plano`. */
export async function linkAsaasIds(
  userId: string,
  plano: Plano,
  refs: RefsAsaas,
): Promise<void> {
  // updateMany (e não update) para um usuário removido não virar 500 e travar a
  // fila sequencial de webhooks do Asaas.
  await appDb().subscription.updateMany({
    where: { userId },
    data: {
      plano,
      ...(refs.asaasCustomerId ? { asaasCustomerId: refs.asaasCustomerId } : {}),
      ...(refs.asaasSubscriptionId ? { asaasSubscriptionId: refs.asaasSubscriptionId } : {}),
    },
  });
}
