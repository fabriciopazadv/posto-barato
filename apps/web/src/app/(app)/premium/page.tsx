'use client';

import { documentoValido, somenteDigitos } from '@posto-barato/domain';
import type { SubscriptionPlan, SubscriptionStatus } from '@posto-barato/shared-types';
import { useState } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { ErrorState, Notices, SkeletonList } from '@/components/ui';
import { PostoBaratoApiError, getPlans, getSubscription, subscribe, usingMock } from '@/lib/data';
import { money } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';

const BENEFITS: { icon: IconName; title: string; description: string }[] = [
  {
    icon: 'notifications_active',
    title: 'Alertas de preço',
    description: 'Avisamos quando o combustível que você usa baixar nos postos que acompanha.',
  },
  {
    icon: 'history',
    title: 'Histórico completo',
    description: 'Veja a variação de 90 dias de qualquer posto, não só dos últimos dias.',
  },
  {
    icon: 'compare_arrows',
    title: 'Comparação avançada',
    description: 'Compare mais postos por vez, considerando trajeto e consumo do seu veículo.',
  },
  {
    icon: 'savings',
    title: 'Economia acumulada',
    description: 'Acompanhe quanto você já economizou desde que começou a usar o app.',
  },
];

/** Como cada estado se apresenta ao usuário. */
const STATUS_UI: Record<
  SubscriptionStatus,
  { rotulo: string; icone: IconName; className: string }
> = {
  TRIAL: { rotulo: 'Teste grátis', icone: 'timer', className: 'bg-tertiary-fixed text-on-tertiary-fixed' },
  TRIAL_EXPIRADO: { rotulo: 'Teste encerrado', icone: 'lock', className: 'bg-surface-container-high text-on-surface-variant' },
  AGUARDANDO_PAGAMENTO: { rotulo: 'Aguardando pagamento', icone: 'schedule', className: 'bg-secondary-fixed text-on-secondary-fixed' },
  ATIVA: { rotulo: 'Assinatura ativa', icone: 'verified', className: 'bg-primary-fixed text-on-primary-fixed' },
  INADIMPLENTE: { rotulo: 'Pagamento em atraso', icone: 'warning', className: 'bg-error-container text-on-error-container' },
  CANCELADA: { rotulo: 'Cancelada', icone: 'info', className: 'bg-surface-container-high text-on-surface-variant' },
};

/**
 * Máscara enquanto a pessoa digita: CPF até 11 dígitos, CNPJ daí em diante.
 * Pontuar no ato deixa o número conferível de relance, sem contar dígitos.
 */
function formatarEnquantoDigita(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    const corpo = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join('.');
    return d.length > 9 ? `${corpo}-${d.slice(9)}` : corpo;
  }
  const corpo = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}`;
  return d.length > 12 ? `${corpo}-${d.slice(12)}` : corpo;
}

export default function PremiumPage() {
  const plans = useAsync(() => getPlans(), []);
  const subscription = useAsync(() => getSubscription(), []);
  const [selecionado, setSelecionado] = useState<SubscriptionPlan | null>(null);
  const [documento, setDocumento] = useState('');
  const [trocandoDocumento, setTrocandoDocumento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sub = subscription.data;
  const planos = plans.data?.planos ?? [];
  const escolhido = selecionado ?? sub?.planoEscolhido ?? sub?.plano ?? planos[0]?.id ?? null;

  // Assinar exige conta: sem `sub` não há assinatura para alterar (sem API, ou
  // sem login). A tela então só apresenta os planos.
  const podeAssinar = Boolean(sub) && sub?.status !== 'ATIVA';
  // O documento guardado dispensa digitar de novo — a não ser que a pessoa peça
  // para trocar.
  const documentoGuardado = !trocandoDocumento ? (sub?.cpfCnpjMascarado ?? null) : null;
  const documentoOk = Boolean(documentoGuardado) || documentoValido(documento);

  async function confirmar(): Promise<void> {
    if (!escolhido || !documentoOk) return;
    setEnviando(true);
    setErro(null);
    try {
      await subscribe(escolhido, documentoGuardado ? undefined : somenteDigitos(documento));
      setDocumento('');
      setTrocandoDocumento(false);
      subscription.reload();
    } catch (err) {
      setErro(
        err instanceof PostoBaratoApiError
          ? err.message
          : 'Não foi possível concluir agora. Tente de novo em instantes.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <TopBar title="Premium" back />

      <div className="space-y-lg py-md">
        {sub && (
          <section className="px-container-margin">
            <div className="pb-card p-md">
              <span className={`pb-pill ${STATUS_UI[sub.status].className}`}>
                <Icon name={STATUS_UI[sub.status].icone} size={14} />
                {STATUS_UI[sub.status].rotulo}
              </span>

              <p className="mt-sm text-body-md text-on-surface-variant">
                {mensagemDeEstado(sub)}
              </p>
            </div>
          </section>
        )}

        <section className="px-container-margin text-center">
          <h2 className="font-display text-headline-lg-mobile">
            Economize ainda mais com o Premium
          </h2>
          {plans.data && (
            <p className="mt-sm text-body-md text-on-surface-variant">
              {plans.data.trialDias} dias grátis. Cancele quando quiser, sem multa.
            </p>
          )}
        </section>

        <section className="px-container-margin">
          <h3 className="sr-only">Planos</h3>

          {plans.loading && <SkeletonList count={3} />}
          {plans.error && <ErrorState message={plans.error} onRetry={plans.reload} />}

          <ul className="space-y-gutter" role="radiogroup" aria-label="Planos disponíveis">
            {planos.map((plano) => {
              const ativo = plano.id === escolhido;
              return (
                <li key={plano.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setSelecionado(plano.id)}
                    className={`pb-card flex w-full items-center gap-md p-md text-left transition-colors
                                ${ativo ? 'border-primary bg-primary-fixed/25' : ''}`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2
                                  ${ativo ? 'border-primary' : 'border-outline'}`}
                    >
                      {ativo && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-sm">
                        <span className="text-body-lg font-bold">{plano.titulo}</span>
                        {plano.economiaPercent > 0 && (
                          <span className="pb-pill bg-primary text-on-primary">
                            −{plano.economiaPercent}%
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-label-bold font-normal text-on-surface-variant">
                        {money(plano.valorMensalCentavos / 100)}/mês
                        {plano.cicloMeses > 1 &&
                          ` · cobrado a cada ${plano.cicloMeses} meses`}
                      </span>
                    </span>

                    <span className="tabular shrink-0 font-display text-headline-md">
                      {money(plano.valorCentavos / 100)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="px-container-margin">
          <h3 className="mb-gutter font-display text-headline-md">O que vem junto</h3>
          <ul className="space-y-gutter">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title} className="pb-card flex gap-md p-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md
                                 bg-primary-fixed text-on-primary-fixed">
                  <Icon name={benefit.icon} size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block text-body-lg font-bold">{benefit.title}</span>
                  <span className="block text-body-md text-on-surface-variant">
                    {benefit.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-container-margin">
          {podeAssinar ? (
            <form
              className="space-y-md"
              onSubmit={(e) => {
                e.preventDefault();
                void confirmar();
              }}
            >
              {/*
                O CPF/CNPJ é pedido aqui, junto com o plano, e não só na hora de
                pagar: é o dado que o gateway exige para emitir a cobrança na
                virada do teste. Sem ele guardado, o fim dos dias grátis não
                viraria cobrança sozinho e a pessoa precisaria voltar a esta tela.
              */}
              {documentoGuardado ? (
                <div className="pb-card flex items-center gap-md p-md">
                  <Icon name="person" size={20} className="shrink-0 text-on-surface-variant" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-bold text-on-surface-variant">
                      CPF/CNPJ do pagador
                    </span>
                    <span className="tabular block text-body-lg">{documentoGuardado}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setTrocandoDocumento(true)}
                    className="pb-btn-ghost shrink-0 px-md"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <label className="block">
                  <span className="text-label-bold text-on-surface-variant">CPF ou CNPJ</span>
                  <div className="relative mt-1">
                    <Icon
                      name="person"
                      size={20}
                      className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2
                                 text-on-surface-variant"
                    />
                    <input
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      value={documento}
                      onChange={(e) => setDocumento(formatarEnquantoDigita(e.target.value))}
                      aria-invalid={documento.length > 0 && !documentoValido(documento)}
                      aria-describedby="ajuda-documento"
                      className="pb-input tabular pl-12"
                    />
                  </div>
                  <span
                    id="ajuda-documento"
                    className="mt-1 block text-label-bold font-normal text-on-surface-variant"
                  >
                    {documento.length > 0 && !documentoValido(documento)
                      ? 'Confira os números: esse CPF/CNPJ não é válido.'
                      : 'Usado só para emitir a cobrança quando o teste terminar.'}
                  </span>
                </label>
              )}

              {erro && (
                <p role="alert" className="rounded-md bg-error-container px-md py-sm text-body-md text-on-error-container">
                  <Icon name="error" size={16} className="mr-1 align-text-bottom" />
                  {erro}
                </p>
              )}

              <button
                type="submit"
                disabled={!documentoOk || !escolhido || enviando}
                className="pb-btn-primary w-full"
              >
                <Icon name={enviando ? 'schedule' : 'workspace_premium'} size={18} />
                {enviando ? 'Confirmando…' : rotuloDoBotao(sub!.status)}
              </button>

              <p className="text-center text-label-bold font-normal text-on-surface-variant">
                {sub!.status === 'TRIAL'
                  ? 'Nada é cobrado agora: a primeira cobrança nasce só quando o teste terminar.'
                  : 'A cobrança é emitida agora, com vencimento hoje.'}
              </p>
            </form>
          ) : (
            <>
              <button type="button" disabled className="pb-btn-primary w-full">
                <Icon name={sub?.status === 'ATIVA' ? 'verified' : 'lock'} size={18} />
                {sub?.status === 'ATIVA' ? 'Assinatura ativa' : 'Assinar'}
              </button>
              {sub?.status !== 'ATIVA' && (
                <p className="mt-sm text-center text-label-bold font-normal text-on-surface-variant">
                  {usingMock
                    ? 'Assinar depende da conta, e a API ainda não está publicada. Nenhum pagamento é processado aqui.'
                    : 'Entre na sua conta para assinar.'}
                </p>
              )}
            </>
          )}
        </section>

        <div className="px-container-margin">
          <Notices
            notices={[
              plans.data
                ? `A cobrança só nasce depois dos ${plans.data.trialDias} dias grátis — durante o teste nada é cobrado.`
                : 'A cobrança só nasce depois dos dias grátis.',
              'Ao cancelar, o acesso continua até o fim do período já pago.',
              'O CPF/CNPJ serve apenas para emitir a cobrança no gateway de pagamento.',
              'Pagamento processado por gateway externo — o app nunca guarda dados de cartão.',
            ]}
          />
        </div>
      </div>
    </>
  );
}

/** O que o botão promete depende de haver ou não dia grátis por usar. */
function rotuloDoBotao(status: SubscriptionStatus): string {
  switch (status) {
    case 'TRIAL':
      return 'Confirmar plano';
    case 'INADIMPLENTE':
      return 'Regularizar pagamento';
    default:
      return 'Assinar';
  }
}

function mensagemDeEstado(sub: NonNullable<Awaited<ReturnType<typeof getSubscription>>>): string {
  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : '—';

  switch (sub.status) {
    case 'TRIAL':
      return sub.planoEscolhido
        ? `Você tem ${sub.diasRestantesTrial} ${sub.diasRestantesTrial === 1 ? 'dia' : 'dias'} de teste. A primeira cobrança do plano escolhido acontece em ${data(sub.trialEndsAt)}.`
        : `Você tem ${sub.diasRestantesTrial} ${sub.diasRestantesTrial === 1 ? 'dia' : 'dias'} de teste. Escolha um plano para continuar depois de ${data(sub.trialEndsAt)}.`;
    case 'TRIAL_EXPIRADO':
      return 'Seus dias grátis terminaram. Escolha um plano para voltar a usar os recursos do Premium.';
    case 'AGUARDANDO_PAGAMENTO':
      return `A cobrança foi emitida e vence em ${data(sub.proximaCobrancaEm)}. Seu acesso segue liberado enquanto o pagamento compensa.`;
    case 'ATIVA':
      return `Tudo em dia. A próxima cobrança é em ${data(sub.proximaCobrancaEm)}.`;
    case 'INADIMPLENTE':
      return 'Não conseguimos confirmar o último pagamento. Regularize para não perder o acesso.';
    case 'CANCELADA':
      return sub.acessoAte
        ? `Assinatura cancelada. Seu acesso vale até ${data(sub.acessoAte)}.`
        : 'Assinatura cancelada.';
  }
}
