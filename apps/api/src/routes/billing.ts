import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@posto-barato/database';
import {
  CARENCIA_HORAS,
  TRIAL_DIAS,
  isPlano,
  listarPlanos,
} from '@posto-barato/domain';
import type {
  CancelSubscriptionResponse,
  PlansResponse,
  SubscribeResponse,
  SubscriptionSummary,
} from '@posto-barato/shared-types';
import type { AppContext } from '../context.js';
import { badRequest, notFound } from '../plugins/errors.js';
import { parseAsaasWebhook } from '../domain/asaas-webhook.js';
import { runBillingCron } from '../services/billing-cron.service.js';
import {
  DocumentoInvalidoError,
  SubscriptionNotFoundError,
  applyExternalStatus,
  cancelSubscription,
  getSubscription,
  linkAsaasIds,
  registerBillingEvent,
  subscribe,
  toSummary,
} from '../services/billing.service.js';

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

async function summaryOrThrow(userId: string): Promise<SubscriptionSummary> {
  const summary = await getSubscription(userId);
  if (!summary) throw notFound('Assinatura não encontrada.');
  return summary;
}

export function registerBillingRoutes(app: FastifyInstance, ctx: AppContext): void {
  /**
   * Planos e parâmetros do ciclo. Existe para a tela nunca anunciar um preço
   * diferente do que será cobrado: os valores vêm da mesma fonte usada ao criar
   * a cobrança.
   */
  app.get(
    '/billing/planos',
    { schema: { tags: ['billing'], summary: 'Planos e parâmetros do ciclo de cobrança' } },
    async (): Promise<PlansResponse> => ({
      planos: listarPlanos(ctx.precos),
      trialDias: TRIAL_DIAS,
      carenciaHoras: CARENCIA_HORAS,
    }),
  );

  app.get(
    '/billing/subscription',
    {
      schema: { tags: ['billing'], summary: 'Estado da assinatura da conta' },
      preHandler: app.requireAuth,
    },
    async (request): Promise<SubscriptionSummary> => summaryOrThrow(request.user!.id),
  );

  /**
   * Assinar. Durante o teste apenas registra o plano escolhido e o CPF/CNPJ do
   * pagador; depois dele, cria a cobrança na hora. O documento é pedido nos dois
   * casos — é ele que permite ao cron virar o teste em cobrança sozinho. Ver
   * `subscribe`.
   */
  app.post(
    '/billing/subscription',
    {
      schema: { tags: ['billing'], summary: 'Escolhe o plano ou cria a cobrança' },
      preHandler: app.requireAuth,
    },
    async (request): Promise<SubscribeResponse> => {
      const body = (request.body ?? {}) as { plano?: unknown; cpfCnpj?: unknown };
      if (!isPlano(body.plano)) {
        throw badRequest('Plano inválido. Use MENSAL, SEMESTRAL ou ANUAL.');
      }
      const cpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj : undefined;

      try {
        const { efeito, cobrancaEm, simulado } = await subscribe(
          request.user!.id,
          body.plano,
          cpfCnpj,
          ctx,
        );
        return {
          efeito,
          cobrancaEm: cobrancaEm.toISOString(),
          simulado,
          subscription: await summaryOrThrow(request.user!.id),
        };
      } catch (err) {
        if (err instanceof SubscriptionNotFoundError) throw notFound(err.message);
        if (err instanceof DocumentoInvalidoError) throw badRequest(err.message);
        // CobrancaAntesDoTrialError e CobrancaNaoConfiguradaError sobem como 500
        // com log: são erro de programação e erro de configuração, não do usuário.
        throw err;
      }
    },
  );

  /**
   * Cancelar precisa ser tão fácil quanto contratar (CDC art. 49 e Decreto
   * 7.962/2013). O acesso não é cortado na hora: quem pagou o ciclo usa o ciclo.
   */
  app.delete(
    '/billing/subscription',
    {
      schema: { tags: ['billing'], summary: 'Cancela a assinatura' },
      preHandler: app.requireAuth,
    },
    async (request): Promise<CancelSubscriptionResponse> => {
      try {
        const { acessoAte } = await cancelSubscription(request.user!.id, ctx);
        return {
          ok: true,
          acessoAte: acessoAte?.toISOString() ?? null,
          subscription: await summaryOrThrow(request.user!.id),
        };
      } catch (err) {
        if (err instanceof SubscriptionNotFoundError) throw notFound(err.message);
        throw err;
      }
    },
  );

  /**
   * Webhook do Asaas. Valida o header `asaas-access-token` contra
   * `ASAAS_WEBHOOK_TOKEN` — sem isso qualquer um poderia forjar
   * `PAYMENT_CONFIRMED` (assinatura de graça) ou `SUBSCRIPTION_DELETED`
   * (derrubar o acesso de um cliente).
   */
  app.post(
    '/billing/webhook',
    { schema: { tags: ['billing'], summary: 'Webhook do Asaas (assinatura)' } },
    async (request, reply) => {
      if (!ctx.env.ASAAS_API_KEY) {
        throw notFound('Webhook não configurado.');
      }
      if (!ctx.env.ASAAS_WEBHOOK_TOKEN && ctx.env.NODE_ENV === 'production') {
        request.log.error('[asaas-webhook] ASAAS_WEBHOOK_TOKEN ausente — recusando evento.');
        reply
          .status(503)
          .send({ error: { code: 'INTERNAL_ERROR', message: 'Webhook não configurado.' } });
        return;
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
      const payload = body as Record<string, unknown>;

      // Idempotência antes de qualquer efeito: o Asaas reentrega em caso de falha.
      const eventoId = typeof payload.id === 'string' ? payload.id : null;
      if (eventoId) {
        const novo = await registerBillingEvent(
          eventoId,
          typeof payload.event === 'string' ? payload.event : 'desconhecido',
          payload,
        );
        if (!novo) {
          request.log.info({ eventoId }, '[asaas-webhook] evento repetido, ignorado');
          reply.send({ received: true, duplicado: true });
          return;
        }
      }

      const evento = parseAsaasWebhook(payload);

      if (evento.type === 'subscription_created' && evento.userId && evento.plano) {
        await linkAsaasIds(evento.userId, evento.plano, evento.refs);
      } else if (evento.type === 'status') {
        const desfecho = await applyExternalStatus(evento.refs, evento.status);
        if (desfecho !== 'aplicado') {
          request.log.warn(
            { desfecho, status: evento.status, refs: evento.refs },
            '[asaas-webhook] transição não aplicada',
          );
        }
      }

      reply.send({ received: true });
    },
  );

  /**
   * Virada do teste grátis + reconciliação. Disparado uma vez por dia pelo
   * agendador da plataforma que hospeda a API, com
   * `Authorization: Bearer $CRON_SECRET`.
   */
  app.post(
    '/billing/cron',
    { schema: { tags: ['billing'], summary: 'Virada do teste e reconciliação (agendado)' } },
    async (request, reply) => {
      const esperado = ctx.env.CRON_SECRET;
      if (!esperado) {
        // Sem segredo, qualquer um dispararia a virada. Em produção é recusa;
        // fora dela, liberado para teste local.
        if (ctx.env.NODE_ENV === 'production') {
          request.log.error('[billing-cron] CRON_SECRET ausente — execução recusada.');
          reply
            .status(503)
            .send({ error: { code: 'INTERNAL_ERROR', message: 'Cron não configurado.' } });
          return;
        }
      } else {
        const recebido = request.headers.authorization ?? '';
        if (!tokensMatch(recebido, `Bearer ${esperado}`)) {
          reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } });
          return;
        }
      }

      reply.send(await runBillingCron(ctx, request.log));
    },
  );

  /**
   * Marcos de tempo da assinatura, para o suporte entender por que o gate
   * decidiu como decidiu.
   */
  app.get(
    '/billing/subscription/debug',
    {
      schema: { tags: ['billing'], summary: 'Marcos de tempo da assinatura (suporte)' },
      preHandler: app.requireAuth,
    },
    async (request) => {
      const sub = await prisma.subscription.findUnique({ where: { userId: request.user!.id } });
      if (!sub) throw notFound('Assinatura não encontrada.');
      return {
        ...toSummary(sub),
        trialStartedAt: sub.trialStartedAt.toISOString(),
        primeiraCobrancaEm: sub.primeiraCobrancaEm?.toISOString() ?? null,
        inadimplenteDesde: sub.inadimplenteDesde?.toISOString() ?? null,
        provedorVinculado: Boolean(sub.asaasSubscriptionId),
      };
    },
  );
}
