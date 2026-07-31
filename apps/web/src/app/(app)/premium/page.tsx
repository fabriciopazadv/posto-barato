'use client';

import type { SubscriptionPlan, SubscriptionStatus } from '@posto-barato/shared-types';
import { useState } from 'react';

import { Icon, type IconName } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { ErrorState, Notices, SkeletonList } from '@/components/ui';
import { getPlans, getSubscription, usingMock } from '@/lib/data';
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

export default function PremiumPage() {
  const plans = useAsync(() => getPlans(), []);
  const subscription = useAsync(() => getSubscription(), []);
  const [selecionado, setSelecionado] = useState<SubscriptionPlan | null>(null);

  const sub = subscription.data;
  const planos = plans.data?.planos ?? [];
  const escolhido = selecionado ?? sub?.planoEscolhido ?? sub?.plano ?? planos[0]?.id ?? null;

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
          <button type="button" disabled className="pb-btn-primary w-full">
            <Icon name="lock" size={18} />
            Assinar
          </button>
          <p className="mt-sm text-center text-label-bold font-normal text-on-surface-variant">
            {usingMock
              ? 'Assinar depende da conta, e a API ainda não está publicada. Nenhum pagamento é processado aqui.'
              : 'Entre na sua conta para assinar.'}
          </p>
        </section>

        <div className="px-container-margin">
          <Notices
            notices={[
              plans.data
                ? `A cobrança só nasce depois dos ${plans.data.trialDias} dias grátis — durante o teste nada é cobrado.`
                : 'A cobrança só nasce depois dos dias grátis.',
              'Ao cancelar, o acesso continua até o fim do período já pago.',
              'Pagamento processado por gateway externo — o app nunca guarda dados de cartão.',
            ]}
          />
        </div>
      </div>
    </>
  );
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
