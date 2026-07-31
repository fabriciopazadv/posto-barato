'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Icon } from '@/components/Icon';
import { MapIllustration } from '@/components/MapIllustration';
import { PriceHistoryChart } from '@/components/PriceHistoryChart';
import { TopBar } from '@/components/TopBar';
import { EmptyState, ErrorState, Notices, SkeletonList } from '@/components/ui';
import { getStation, getStationHistory } from '@/lib/data';
import { distance, FRESHNESS, money, pricePerUnit, relativeAge } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useAsync } from '@/lib/useAsync';

/**
 * Detalhes do posto.
 *
 * O id vem por query string em vez de rota dinâmica (`/posto/[id]`): com
 * `output: 'export'` uma rota dinâmica exigiria conhecer todos os ids em tempo
 * de build, o que é impossível com a API real.
 */
export default function PostoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PostoContent />
    </Suspense>
  );
}

function Loading() {
  return (
    <>
      <TopBar title="Posto" back />
      <div className="space-y-gutter p-container-margin">
        <SkeletonList count={2} />
      </div>
    </>
  );
}

function PostoContent() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const { isFavorite, toggleFavorite, origin } = usePrefs();
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);

  const station = useAsync(() => (id ? getStation(id) : Promise.resolve(null)), [id]);
  const detail = station.data;
  const mainProduct = detail?.lowestPrice?.productCode ?? '';

  const history = useAsync(
    () =>
      id && mainProduct
        ? getStationHistory(id, mainProduct, windowDays)
        : Promise.resolve(null),
    [id, mainProduct, windowDays],
  );

  if (station.loading) return <Loading />;

  if (station.error) {
    return (
      <>
        <TopBar title="Posto" back />
        <div className="p-container-margin">
          <ErrorState message={station.error} onRetry={station.reload} />
        </div>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <TopBar title="Posto" back />
        <div className="p-container-margin">
          <EmptyState
            icon="local_gas_station"
            title="Posto não encontrado"
            description="Este posto não existe ou não tem preços publicados."
          />
        </div>
      </>
    );
  }

  const favorite = isFavorite(detail.id);
  const dist = distance(detail.distanceKm);
  const mapsUrl =
    detail.latitude !== null && detail.longitude !== null
      ? `https://www.google.com/maps/dir/?api=1&destination=${detail.latitude},${detail.longitude}`
      : null;

  return (
    <>
      <TopBar
        title={detail.name}
        back
        action={
          <button
            type="button"
            onClick={() => toggleFavorite(detail.id)}
            aria-pressed={favorite}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-full
                       text-on-surface-variant hover:bg-surface-container"
          >
            <Icon
              name="favorite"
              filled={favorite}
              label={favorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
              className={favorite ? 'text-primary' : ''}
            />
          </button>
        }
      />

      <MapIllustration className="h-40 w-full" />

      <div className="space-y-lg py-md">
        <header className="px-container-margin">
          <h2 className="font-display text-headline-lg-mobile">{detail.name}</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">{detail.address}</p>
          <p className="text-body-md text-on-surface-variant">
            {detail.neighborhood ? `${detail.neighborhood} · ` : ''}
            {detail.municipality} - {detail.state}
          </p>

          <div className="mt-md flex flex-wrap gap-sm">
            {dist && (
              <span className="pb-pill bg-surface-container text-on-surface-variant">
                <Icon name="place" size={14} />
                {dist}
              </span>
            )}
            {detail.isDemo && (
              <span className="pb-pill bg-tertiary-fixed text-on-tertiary-fixed">
                Dado demonstrativo
              </span>
            )}
          </div>

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pb-btn-primary mt-md w-full"
            >
              <Icon name="directions" size={20} />
              Ir até o posto
            </a>
          )}
        </header>

        <section className="px-container-margin">
          <h3 className="mb-gutter font-display text-headline-md">Preços atuais</h3>
          <ul className="pb-card divide-y divide-outline-variant">
            {detail.prices.map((price) => (
              <li key={price.productCode} className="flex items-center justify-between gap-md p-md">
                <div className="min-w-0">
                  <p className="text-body-lg font-bold">{price.productName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-sm text-label-bold
                                font-normal text-on-surface-variant">
                    <span>Atualizado {relativeAge(price.ageMinutes)}</span>
                    <span className={`pb-pill ${FRESHNESS[price.freshness].className}`}>
                      {FRESHNESS[price.freshness].label}
                    </span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular font-display text-price-display">{money(price.price)}</p>
                  <p className="text-label-bold font-normal text-on-surface-variant">
                    {pricePerUnit(price.price, price.unit)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {history.data && (
          <section className="px-container-margin">
            <div className="mb-gutter flex items-center justify-between gap-sm">
              <h3 className="font-display text-headline-md">Histórico</h3>
              <div className="flex gap-1" role="group" aria-label="Período do histórico">
                {([7, 30, 90] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setWindowDays(days)}
                    aria-pressed={windowDays === days}
                    className={`rounded-full px-3 py-1 text-label-bold transition-colors ${
                      windowDays === days
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
            <PriceHistoryChart history={history.data} />
          </section>
        )}

        <div className="px-container-margin">
          <p className="mb-sm text-label-bold font-normal text-on-surface-variant">
            Fonte: {detail.source}
          </p>
          <Notices notices={detail.notices} />
        </div>
      </div>
    </>
  );
}
