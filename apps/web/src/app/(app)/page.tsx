'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { FuelChips } from '@/components/FuelChips';
import { Icon } from '@/components/Icon';
import { StationCard } from '@/components/StationCard';
import { TopBar } from '@/components/TopBar';
import { EmptyState, ErrorState, Notices, Section, SkeletonList } from '@/components/ui';
import { getConfig, getPriceSummary, getProducts, getStations, usingMock } from '@/lib/data';
import { money, pricePerUnit } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useAsync } from '@/lib/useAsync';

export default function HomePage() {
  const { product, setProduct, origin, ready, requestGeolocation } = usePrefs();

  const config = useAsync(() => getConfig(), []);
  const products = useAsync(() => getProducts(), []);

  const stations = useAsync(
    () =>
      getStations({
        product,
        latitude: origin?.latitude,
        longitude: origin?.longitude,
        sort: 'lowest_price',
        limit: 5,
      }),
    [product, origin?.latitude, origin?.longitude],
  );

  const summary = useAsync(
    () =>
      getPriceSummary(
        config.data?.defaultMunicipality ?? 'Rondonópolis',
        config.data?.defaultState ?? 'MT',
        product,
      ),
    [product, config.data?.defaultMunicipality, config.data?.defaultState],
  );

  const list = stations.data?.data ?? [];
  const prices = list.map((s) => s.lowestPrice?.price ?? Infinity);
  const cheapest = prices.length ? Math.min(...prices) : undefined;
  const dearest = prices.length ? Math.max(...prices.filter(Number.isFinite)) : undefined;

  const productSummary = useMemo(
    () => summary.data?.find((s) => s.productCode === product) ?? summary.data?.[0] ?? null,
    [summary.data, product],
  );

  return (
    <>
      <TopBar
        title="Posto Barato"
        action={
          <Link
            href="/perfil"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-full
                       text-on-surface-variant hover:bg-surface-container"
          >
            <Icon name="account_circle" label="Perfil" />
          </Link>
        }
      />

      <div className="space-y-lg py-md">
        <div className="px-container-margin">
          <button
            type="button"
            onClick={() => void requestGeolocation()}
            className="flex items-center gap-1 text-label-bold font-normal text-on-surface-variant
                       hover:text-primary"
          >
            <Icon name="my_location" size={16} />
            {ready && origin ? origin.label : 'Definir localização'}
          </button>
          <h2 className="mt-1 font-display text-headline-lg-mobile">
            Onde abastecer hoje?
          </h2>
        </div>

        <div className="px-container-margin">
          <Link
            href="/mapa"
            className="pb-input flex items-center gap-sm text-on-surface-variant"
          >
            <Icon name="search" size={20} />
            Buscar posto, bairro ou combustível
          </Link>
        </div>

        {products.data && (
          <div className="px-container-margin">
            <FuelChips products={products.data} selected={product} onSelect={setProduct} />
          </div>
        )}

        {productSummary && (
          <section className="px-container-margin" aria-label="Resumo de preços do município">
            <div className="pb-card grid grid-cols-3 divide-x divide-outline-variant p-md">
              {[
                { label: 'Mais barato', value: productSummary.min, accent: true },
                { label: 'Média', value: productSummary.avg, accent: false },
                { label: 'Mais caro', value: productSummary.max, accent: false },
              ].map((item) => (
                <div key={item.label} className="px-2 text-center first:pl-0 last:pr-0">
                  <p className="text-label-bold font-normal text-on-surface-variant">
                    {item.label}
                  </p>
                  <p
                    className={`tabular mt-1 font-display text-headline-md ${
                      item.accent ? 'text-primary' : 'text-on-surface'
                    }`}
                  >
                    {money(item.value)}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-sm text-label-bold font-normal text-on-surface-variant">
              {productSummary.productName} em {productSummary.municipality} -{' '}
              {productSummary.state} · {productSummary.stationCount} postos
            </p>
          </section>
        )}

        <Section
          title="Melhores opções perto de você"
          action={
            <Link href="/mapa" className="text-label-bold text-primary hover:underline">
              Ver todos
            </Link>
          }
        >
          {stations.loading && <SkeletonList count={3} />}

          {stations.error && <ErrorState message={stations.error} onRetry={stations.reload} />}

          {!stations.loading && !stations.error && list.length === 0 && (
            <EmptyState
              icon="local_gas_station"
              title="Nenhum posto encontrado"
              description="Não há preços recentes para este combustível na sua região. Tente outro combustível."
            />
          )}

          <div className="space-y-gutter">
            {list.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                cheapestPrice={cheapest}
                savingsPerLiter={
                  dearest !== undefined && station.lowestPrice
                    ? Math.round((dearest - station.lowestPrice.price) * 1000) / 1000
                    : undefined
                }
              />
            ))}
          </div>
        </Section>

        {list.length >= 2 && (
          <section className="px-container-margin">
            <Link
              href="/comparador"
              className="pb-card flex items-center gap-md p-md hover:bg-surface-container-low"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md
                               bg-primary-fixed text-on-primary-fixed">
                <Icon name="calculate" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-lg font-bold">Vale a pena desviar?</span>
                <span className="block text-body-md text-on-surface-variant">
                  Compare o custo real considerando o deslocamento até o posto.
                </span>
              </span>
              <Icon name="chevron_right" className="text-on-surface-variant" />
            </Link>
          </section>
        )}

        {list[0]?.lowestPrice && (
          <p className="px-container-margin text-label-bold font-normal text-on-surface-variant">
            Menor preço do momento:{' '}
            <span className="tabular font-bold text-on-surface">
              {pricePerUnit(list[0].lowestPrice.price, list[0].lowestPrice.unit)}
            </span>
          </p>
        )}

        <div className="px-container-margin">
          <Notices notices={config.data?.notices ?? []} />
        </div>

        {usingMock && (
          <p className="px-container-margin text-label-bold font-normal text-on-surface-variant">
            Modo demonstração: dados de exemplo de Rondonópolis/MT. Configure{' '}
            <code className="rounded bg-surface-container px-1">NEXT_PUBLIC_API_URL</code> para
            usar a API real.
          </p>
        )}
      </div>
    </>
  );
}
