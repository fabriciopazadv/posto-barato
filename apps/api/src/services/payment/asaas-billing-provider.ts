/**
 * Assinatura do Premium via Asaas (API de Assinaturas com forma de pagamento
 * aberta — a cada ciclo o cliente escolhe Pix, cartão ou boleto).
 *
 * Portado do mei-facil. O ciclo tem dois momentos deliberadamente separados:
 *
 *  1. **Durante o teste** (`registrarIntencao`): a pessoa escolhe o plano e o
 *     app grava só isso. Nada é criado no Asaas — nenhum cliente, nenhuma
 *     assinatura, nenhuma cobrança. É o que garante que não existe cobrança
 *     enquanto houver dia grátis por usar.
 *  2. **Na virada do teste** (`criarCobranca`, chamada pelo cron ou por quem
 *     assina depois do prazo): aí sim o cliente e a assinatura nascem no Asaas,
 *     com vencimento hoje.
 *
 * Sem `ASAAS_API_KEY` fora de produção, opera em modo simulado.
 */
import {
  CICLO_ASAAS,
  TRIAL_DIAS,
  dataEmSaoPaulo,
  descreverPlano,
  garantirCobrancaPermitida,
  proximoVencimento,
  type Plano,
  type TabelaPrecos,
} from '@posto-barato/domain';
import { prisma } from '@posto-barato/database';

/**
 * Lançado quando a cobrança real não está configurada em produção. Existe para
 * o modo simulado nunca ser um fallback silencioso: um deploy sem
 * `ASAAS_API_KEY` liberaria o Premium de graça para todo mundo.
 */
export class CobrancaNaoConfiguradaError extends Error {
  constructor() {
    super('A cobrança não está configurada.');
    this.name = 'CobrancaNaoConfiguradaError';
  }
}

/** Dados exigidos pelo Asaas ao criar o cliente. */
export interface DadosPagador {
  nome: string;
  email: string;
  /** Apenas dígitos. A rota garante que não vem vazio no modo real. */
  cpfCnpj: string;
}

export interface AsaasConfig {
  apiKey?: string | undefined;
  ambiente: 'sandbox' | 'production';
  producao: boolean;
  precos: TabelaPrecos;
}

export class AsaasBillingProvider {
  constructor(private readonly config: AsaasConfig) {}

  get configurado(): boolean {
    return Boolean(this.config.apiKey);
  }

  private get apiBaseUrl(): string {
    return this.config.ambiente === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3';
  }

  /** POST autenticado; erro estruturado com o corpo da resposta. */
  private async postAsaas<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: this.config.apiKey as string,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detalhe = await res.text().catch(() => '');
      throw new Error(`Falha na API do Asaas (${res.status}) em ${path}: ${detalhe}`);
    }
    return (await res.json()) as T;
  }

  /** GET autenticado; `null` quando o recurso não existe. */
  async getAsaas<T>(path: string): Promise<T | null> {
    if (!this.config.apiKey) return null;
    const res = await fetch(`${this.apiBaseUrl}${path}`, {
      headers: { access_token: this.config.apiKey },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const detalhe = await res.text().catch(() => '');
      throw new Error(`Falha na API do Asaas (${res.status}) em ${path}: ${detalhe}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Registra o plano escolhido durante o teste, travando o preço vigente.
   * Não toca no Asaas e não muda o status: a pessoa segue em TRIAL até a virada.
   */
  async registrarIntencao(userId: string, plano: Plano): Promise<{ cobrancaEm: Date }> {
    const sub = await prisma.subscription.update({
      where: { userId },
      data: {
        planoEscolhido: plano,
        valorCentavos: descreverPlano(plano, this.config.precos).valorCentavos,
      },
      select: { trialEndsAt: true },
    });
    return { cobrancaEm: sub.trialEndsAt };
  }

  /**
   * Cria a cobrança recorrente no Asaas com vencimento **hoje** e deixa a
   * assinatura em AGUARDANDO_PAGAMENTO.
   *
   * Recusa-se a rodar enquanto houver dia grátis por usar
   * (`garantirCobrancaPermitida`) — é a trava que sustenta a regra do produto,
   * independentemente de quem chame.
   */
  async criarCobranca(
    userId: string,
    plano: Plano,
    pagador: DadosPagador,
  ): Promise<{ simulado: boolean; vencimento: Date }> {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: {
        trialEndsAt: true,
        status: true,
        asaasCustomerId: true,
        asaasSubscriptionId: true,
      },
    });
    if (!sub) throw new Error(`Assinatura inexistente para o usuário ${userId}`);

    garantirCobrancaPermitida(sub.trialEndsAt);

    const { valorCentavos } = descreverPlano(plano, this.config.precos);
    const hoje = new Date();

    if (!this.config.apiKey) {
      // Em produção a ausência da chave é erro, não degradação silenciosa.
      if (this.config.producao) throw new CobrancaNaoConfiguradaError();
      // Demonstração: assume a cobrança como paga para o fluxo seguir.
      await prisma.subscription.update({
        where: { userId },
        data: {
          plano,
          planoEscolhido: plano,
          valorCentavos,
          status: 'ATIVA',
          primeiraCobrancaEm: hoje,
          proximaCobrancaEm: proximoVencimento(plano, hoje),
          ultimoPagamentoEm: hoje,
          inadimplenteDesde: null,
        },
      });
      return { simulado: true, vencimento: hoje };
    }

    // Idempotência: assinatura já criada no Asaas → nada a criar lá fora.
    if (sub.asaasSubscriptionId) {
      await prisma.subscription.updateMany({
        where: { userId, status: { in: ['TRIAL', 'TRIAL_EXPIRADO'] } },
        data: { status: 'AGUARDANDO_PAGAMENTO' },
      });
      return { simulado: false, vencimento: hoje };
    }

    // 1) Cliente no Asaas. Persistido assim que criado: se o passo 2 falhar, a
    //    retentativa reaproveita este cliente em vez de duplicar o cadastro.
    let asaasCustomerId = sub.asaasCustomerId;
    if (!asaasCustomerId) {
      const cliente = await this.postAsaas<{ id: string }>('/customers', {
        name: pagador.nome,
        email: pagador.email,
        cpfCnpj: pagador.cpfCnpj,
        externalReference: userId,
      });
      asaasCustomerId = cliente.id;
      await prisma.subscription.update({ where: { userId }, data: { asaasCustomerId } });
    }

    // 2) Assinatura recorrente com forma de pagamento aberta (Pix/cartão/boleto),
    //    vencendo hoje — os dias gratuitos já foram usados.
    const assinatura = await this.postAsaas<{ id: string }>('/subscriptions', {
      customer: asaasCustomerId,
      billingType: 'UNDEFINED',
      value: valorCentavos / 100,
      nextDueDate: dataEmSaoPaulo(hoje),
      cycle: CICLO_ASAAS[plano],
      // A API do Asaas limita description a 500 caracteres.
      description: `Posto Barato Premium (${descreverPlano(plano, this.config.precos).titulo.toLowerCase()}) — após ${TRIAL_DIAS} dias grátis.`,
      // userId + plano viajam até os webhooks de pagamento/assinatura.
      externalReference: `${userId}:${plano}`,
    });

    // 3) Vincula a assinatura recém-criada. É o primeiro gravado depois da
    //    chamada ao Asaas: sem este vínculo existiria cobrança lá fora sem
    //    contrapartida aqui dentro.
    await prisma.subscription.update({
      where: { userId },
      data: {
        plano,
        planoEscolhido: plano,
        valorCentavos,
        status: 'AGUARDANDO_PAGAMENTO',
        asaasCustomerId,
        asaasSubscriptionId: assinatura.id,
        primeiraCobrancaEm: hoje,
        proximaCobrancaEm: hoje,
      },
    });

    return { simulado: false, vencimento: hoje };
  }

  /**
   * Encerra a assinatura no Asaas para o cliente parar de receber cobranças.
   * Idempotente: 404 significa que já não existe lá, o que é o desfecho
   * desejado. O status local é responsabilidade de quem chama.
   */
  async cancelarNoAsaas(asaasSubscriptionId: string): Promise<void> {
    if (!this.config.apiKey) return;
    const res = await fetch(`${this.apiBaseUrl}/subscriptions/${asaasSubscriptionId}`, {
      method: 'DELETE',
      headers: { access_token: this.config.apiKey },
    });
    if (!res.ok && res.status !== 404) {
      const detalhe = await res.text().catch(() => '');
      throw new Error(`Falha ao cancelar no Asaas (${res.status}): ${detalhe}`);
    }
  }
}

export function buildAsaasProvider(config: AsaasConfig): AsaasBillingProvider {
  return new AsaasBillingProvider(config);
}
