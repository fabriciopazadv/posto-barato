'use client';

import { useMemo } from 'react';

import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { EmptyState, ErrorState, Notices, SkeletonList } from '@/components/ui';
import { getPriceSummary, getStations } from '@/lib/data';
import { money, percent } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useAsync } from '@/lib/useAsync';

/**
 * Economia potencial.
 *
 * Enquanto não existe histórico de abastecimentos do usuário (depende da área
 * autenticada), a tela mostra a economia POSSÍVEL hoje: diferença entre o
 * posto mais barato e a média da cidade, projetada no tanque do veículo. Não
 * inventamos um "quanto você já economizou" que não temos como saber.
 */
export default function EconomiaPage() {
  const { product, vehicles, origin } = usePrefs();
  const vehicle = vehicles[0];
  const tank = vehicle?.tankOrBattery ?? 50;

  const summary = useAsync(
    () => getPriceSummary('Rondonópolis', 'MT', product),
    [product],
  );
  const stations = useAsync(
    () =>
      getStations({
        product,
        latitude: origin?.latitude,
        longitude: origin?.longitude,
        sort: 'lowest_price',
        limit: 50,
      }),
    [product, origin?.latitude, origin?.longitude],
  );

  const data = summary.data?.[0] ?? null;
  const list = stations.data?.data ?? [];

  const numbers = useMemo(() => {
    if (!data) return null;
    const perLiter = data.avg - data.min;
    return {
      perLiter,
      perTank: perLiter * tank,
      perYear: perLiter * tank * 12,
      versusWorst: (data.max - data.min) * tank,
      percentOff: data.avg > 0 ? ((data.avg - data.min) / data.avg) * 100 : 0,
    };
  }, [data, tank]);

  const cheapest = list[0] ?? null;
  const loading = summary.loading || stations.loading;

  return (
    <>
      <TopBar title="Minha economia" back />

      <div className="space-y-lg py-md">
        {loading && (
          <div className="px-container-margin">
            <SkeletonList count={2} />
          </div>
        )}

        {summary.error && (
          <div className="px-container-margin">
            <ErrorState message={summary.error} onRetry={summary.reload} />
          </div>
        )}

        {!loading && !data && (
          <div className="px-container-margin">
            <EmptyState
              icon="savings"
              title="Sem dados suficientes"
              description="Ainda não há preços coletados para este combustível na sua cidade."
            />
          </div>
        )}

        {data && numbers && (
          <>
            <section className="px-container-margin">
              <div className="rounded-lg bg-primary p-lg text-center text-on-primary">
                <p className="text-label-bold opacity-90">
                  ECONOMIA POR TANQUE DE {tank} L
                </p>
                <p className="tabular mt-sm font-display text-headline-lg">
                  {money(numbers.perTank)}
                </p>
                <p className="mt-1 text-body-md opacity-90">
                  abastecendo no mais barato em vez da média da cidade
                </p>
              </div>
            </section>

            <section className="px-container-margin">
              <h2 className="mb-gutter font-display text-headline-md">Como chegamos nisso</h2>
              <ul className="pb-card divide-y divide-outline-variant">
                {[
                  { label: 'Menor preço da cidade', value: money(data.min), accent: true },
                  { label: 'Preço médio', value: money(data.avg), accent: false },
                  { label: 'Maior preço', value: money(data.max), accent: false },
                  {
                    label: 'Diferença por litro',
                    value: `${money(numbers.perLiter)} (${percent(numbers.percentOff)})`,
                    accent: true,
                  },
                ].map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-md px-md py-3">
                    <span className="text-body-md text-on-surface-variant">{row.label}</span>
                    <span
                      className={`tabular text-body-lg font-bold ${
                        row.accent ? 'text-primary' : 'text-on-surface'
                      }`}
                    >
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="px-container-margin">
              <h2 className="mb-gutter font-display text-headline-md">Projeção</h2>
              <div className="grid grid-cols-2 gap-gutter">
                <div className="pb-card p-md">
                  <Icon name="local_gas_station" className="text-on-surface-variant" />
                  <p className="tabular mt-sm font-display text-headline-md">
                    {money(numbers.versusWorst)}
                  </p>
                  <p className="text-label-bold font-normal text-on-surface-variant">
                    por tanque, contra o posto mais caro
                  </p>
                </div>
                <div className="pb-card p-md">
                  <Icon name="savings" className="text-on-surface-variant" />
                  <p className="tabular mt-sm font-display text-headline-md">
                    {money(numbers.perYear)}
                  </p>
                  <p className="text-label-bold font-normal text-on-surface-variant">
                    em 12 tanques ao longo do ano
                  </p>
                </div>
              </div>
            </section>

            {cheapest && (
              <section className="px-container-margin">
                <h2 className="mb-gutter font-display text-headline-md">Onde está o menor preço</h2>
                <a
                  href={`/posto/?id=${encodeURIComponent(cheapest.id)}`}
                  className="pb-card flex items-center gap-md p-md hover:bg-surface-container-low"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md
                                   bg-primary-fixed text-on-primary-fixed">
                    <Icon name="local_gas_station" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-lg font-bold">{cheapest.name}</span>
                    <span className="block truncate text-body-md text-on-surface-variant">
                      {cheapest.neighborhood ?? cheapest.address}
                    </span>
                  </span>
                  {cheapest.lowestPrice && (
                    <span className="tabular shrink-0 font-display text-headline-md text-primary">
                      {money(cheapest.lowestPrice.price)}
                    </span>
                  )}
                </a>
              </section>
            )}

            <div className="px-container-margin">
              <Notices
                notices={[
                  'Projeção baseada nos preços publicados e no tanque do seu veículo cadastrado.',
                  'O histórico de abastecimentos entra quando as contas de usuário forem publicadas.',
                ]}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
