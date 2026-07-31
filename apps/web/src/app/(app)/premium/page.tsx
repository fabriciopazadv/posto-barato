'use client';

import { Icon, type IconName } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { Notices } from '@/components/ui';
import { usingMock } from '@/lib/data';
import { money } from '@/lib/format';

/**
 * Premium vitalício: compra única, não assinatura recorrente
 * (docs/architecture/auth-billing.md). O valor real vem de
 * `GET /api/v1/billing/offer` quando a área autenticada estiver publicada.
 */
const PRICE_CENTS = 999;

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

export default function PremiumPage() {
  return (
    <>
      <TopBar title="Premium" back />

      <div className="space-y-lg py-md">
        <section className="px-container-margin text-center">
          <span className="pb-pill mx-auto bg-primary-fixed text-on-primary-fixed">
            <Icon name="workspace_premium" size={16} />
            PAGAMENTO ÚNICO
          </span>
          <h2 className="mt-md font-display text-headline-lg-mobile">
            Economize ainda mais com o Premium
          </h2>
          <p className="tabular mt-sm font-display text-headline-lg text-primary">
            {money(PRICE_CENTS / 100)}
          </p>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Uma vez só. Sem mensalidade, sem renovação automática.
          </p>
        </section>

        <section className="px-container-margin">
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
            Checkout indisponível
          </button>
          <p className="mt-sm text-center text-label-bold font-normal text-on-surface-variant">
            {usingMock
              ? 'O checkout depende da API de cobrança, que ainda não está publicada. Nenhum pagamento é processado aqui.'
              : 'A área de compra será liberada junto com o login.'}
          </p>
        </section>

        <div className="px-container-margin">
          <Notices
            notices={[
              'O Premium é uma compra única e não gera cobrança recorrente.',
              'Pagamento processado por gateway externo — o app nunca guarda dados de cartão.',
            ]}
          />
        </div>
      </div>
    </>
  );
}
