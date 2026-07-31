/**
 * Virada do teste grátis e reconciliação com o Asaas.
 *
 * No mei-facil isso roda como Vercel Cron. Aqui a API é um processo Fastify, e
 * o Netlify não agenda nada (o site é estático), então o gatilho é externo:
 * `POST /api/v1/billing/cron` com `Authorization: Bearer $CRON_SECRET`, disparado
 * uma vez por dia pelo agendador da plataforma que hospedar a API.
 */
import { prisma } from '@posto-barato/database';
import {
  documentoValido,
  proximoVencimento,
  transicaoExternaPermitida,
  type Plano,
  type StatusAssinatura,
} from '@posto-barato/domain';
import type { AppContext } from '../context.js';
import { buildProvider } from './billing.service.js';
import type { AsaasBillingProvider } from './payment/asaas-billing-provider.js';

/** Assinaturas conferidas por execução — a varredura é diária. */
const LOTE_RECONCILIACAO = 200;

export interface CronResult {
  avaliados: number;
  cobrancas: number;
  expirados: number;
  /** Escolheram plano antes de o documento passar a ser pedido na escolha. */
  semDocumento: number;
  falhas: number;
  reconciliadas: number;
}

/**
 * É o **único** lugar onde a primeira cobrança de um cliente nasce sozinha, e
 * só atua sobre quem já usou todos os dias gratuitos:
 *
 *  - escolheu plano durante o teste → cria a cobrança no Asaas com vencimento
 *    hoje e passa a AGUARDANDO_PAGAMENTO (acesso mantido durante a carência);
 *  - não escolheu → TRIAL_EXPIRADO, paywall, sem nenhuma cobrança criada.
 *
 * A virada é automática porque o CPF/CNPJ é pedido junto com a escolha do plano,
 * ainda durante o teste: o documento que o Asaas exige para criar o cliente já
 * está guardado quando o cron chega aqui, sem depender de o usuário voltar.
 *
 * Idempotente: reexecutar no mesmo dia não cria cobrança duplicada, porque a
 * transição tira o usuário do conjunto `status = TRIAL AND trialEndsAt <= agora`.
 */
export async function runBillingCron(ctx: AppContext, log: Logger): Promise<CronResult> {
  const agora = new Date();
  const vencidos = await prisma.subscription.findMany({
    where: { status: 'TRIAL', trialEndsAt: { lte: agora } },
    select: {
      userId: true,
      planoEscolhido: true,
      cpfCnpjPagador: true,
      user: { select: { name: true, email: true } },
    },
  });

  const resultado: CronResult = {
    avaliados: vencidos.length,
    cobrancas: 0,
    expirados: 0,
    semDocumento: 0,
    falhas: 0,
    reconciliadas: 0,
  };

  const provider = buildProvider(ctx);

  for (const sub of vencidos) {
    const plano = sub.planoEscolhido as Plano | null;

    // Sem plano escolhido não há o que cobrar: paywall e ponto.
    if (!plano) {
      await prisma.subscription.update({
        where: { userId: sub.userId },
        data: { status: 'TRIAL_EXPIRADO' },
      });
      resultado.expirados += 1;
      continue;
    }

    // Assinaturas de antes desta mudança podem ter plano sem documento. Tentar
    // cobrar assim falharia hoje, amanhã e em toda execução seguinte; leva ao
    // paywall de uma vez, onde a pessoa reassina informando o CPF. O aviso fica
    // no log para o suporte saber que não é indisponibilidade do Asaas.
    if (provider.configurado && !documentoValido(sub.cpfCnpjPagador)) {
      await prisma.subscription.update({
        where: { userId: sub.userId },
        data: { status: 'TRIAL_EXPIRADO' },
      });
      resultado.semDocumento += 1;
      log.warn(
        { userId: sub.userId, plano },
        '[billing-cron] plano escolhido sem CPF/CNPJ guardado — paywall em vez de cobrança',
      );
      continue;
    }

    try {
      await provider.criarCobranca(sub.userId, plano, {
        nome: sub.user.name ?? 'Cliente Posto Barato',
        email: sub.user.email,
        // Guardado quando a pessoa escolheu o plano, durante o teste.
        cpfCnpj: sub.cpfCnpjPagador ?? '',
      });
      resultado.cobrancas += 1;
    } catch (err) {
      // Uma falha (indisponibilidade do Asaas, recusa do documento) não pode
      // derrubar a virada dos demais. O usuário segue em TRIAL vencido — o gate
      // já bloqueia — e a próxima execução tenta de novo.
      resultado.falhas += 1;
      log.error({ err, userId: sub.userId }, '[billing-cron] falha ao cobrar na virada');
    }
  }

  resultado.reconciliadas = await reconciliar(provider, log);
  log.info(resultado, '[billing-cron] execução concluída');
  return resultado;
}

/**
 * Reconciliação com o Asaas — a rede de segurança para webhooks perdidos.
 *
 * Sem ela, todo o estado de cobrança dependeria de o webhook chegar: um evento
 * entregue enquanto a env estava ausente deixaria cliente pagante bloqueado, e
 * uma assinatura excluída direto no painel do Asaas manteria o acesso liberado
 * para sempre. Aqui o app **pergunta** em vez de esperar, e aplica o resultado
 * pelos mesmos guardas de transição do webhook.
 */
async function reconciliar(provider: AsaasBillingProvider, log: Logger): Promise<number> {
  if (!provider.configurado) return 0;

  const candidatas = await prisma.subscription.findMany({
    where: {
      asaasSubscriptionId: { not: null },
      status: { in: ['AGUARDANDO_PAGAMENTO', 'ATIVA', 'INADIMPLENTE'] },
    },
    orderBy: { updatedAt: 'asc' },
    take: LOTE_RECONCILIACAO,
    select: { id: true, userId: true, status: true, plano: true, asaasSubscriptionId: true },
  });

  let corrigidas = 0;
  for (const sub of candidatas) {
    try {
      const desejado = await estadoRealNoAsaas(provider, sub.asaasSubscriptionId!);
      if (!desejado || desejado === sub.status) continue;
      if (!transicaoExternaPermitida(sub.status as StatusAssinatura, desejado)) continue;

      const agora = new Date();
      const plano = (sub.plano ?? 'MENSAL') as Plano;
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: desejado,
          ...(desejado === 'ATIVA'
            ? {
                ultimoPagamentoEm: agora,
                proximaCobrancaEm: proximoVencimento(plano, agora),
                inadimplenteDesde: null,
              }
            : {}),
          ...(desejado === 'INADIMPLENTE' ? { inadimplenteDesde: agora } : {}),
          ...(desejado === 'CANCELADA' ? { canceladaEm: agora } : {}),
        },
      });
      corrigidas += 1;
      log.warn(
        { userId: sub.userId, de: sub.status, para: desejado },
        '[billing-cron] divergência corrigida',
      );
    } catch (err) {
      log.error({ err, userId: sub.userId }, '[billing-cron] falha ao reconciliar');
    }
  }
  return corrigidas;
}

/**
 * Traduz o que o Asaas diz sobre a assinatura para o nosso status. Devolve
 * `null` quando não há sinal conclusivo — silêncio não é motivo para mudar nada.
 */
async function estadoRealNoAsaas(
  provider: AsaasBillingProvider,
  asaasSubscriptionId: string,
): Promise<'ATIVA' | 'INADIMPLENTE' | 'CANCELADA' | null> {
  const assinatura = await provider.getAsaas<{ status?: string; deleted?: boolean }>(
    `/subscriptions/${asaasSubscriptionId}`,
  );
  // Sumiu ou foi encerrada lá: encerrada aqui.
  if (!assinatura || assinatura.deleted === true) return 'CANCELADA';
  if (assinatura.status === 'INACTIVE' || assinatura.status === 'EXPIRED') return 'CANCELADA';

  // A cobrança mais recente é quem diz se o cliente está em dia.
  const cobrancas = await provider.getAsaas<{ data?: { status?: string }[] }>(
    `/payments?subscription=${asaasSubscriptionId}&limit=1&order=desc&sort=dueDate`,
  );
  const ultima = cobrancas?.data?.[0]?.status;
  if (ultima === 'RECEIVED' || ultima === 'CONFIRMED' || ultima === 'RECEIVED_IN_CASH') {
    return 'ATIVA';
  }
  if (ultima === 'OVERDUE') return 'INADIMPLENTE';
  return null;
}

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}
