'use client';

import { Icon } from '@/components/Icon';
import { MapIllustration } from '@/components/MapIllustration';
import { TopBar } from '@/components/TopBar';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { getChargingPoints, getConfig } from '@/lib/data';
import { distance } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useAsync } from '@/lib/useAsync';

export default function RecargaPage() {
  const { origin } = usePrefs();

  const config = useAsync(() => getConfig(), []);
  const points = useAsync(
    () =>
      getChargingPoints(
        origin ? { latitude: origin.latitude, longitude: origin.longitude } : undefined,
      ),
    [origin?.latitude, origin?.longitude],
  );

  // A rota de recarga é controlada por feature flag na API (FEATURE_CHARGING_STATIONS).
  const enabled = config.data?.features?.chargingStations ?? false;
  const list = points.data ?? [];

  return (
    <>
      <TopBar title="Recarga elétrica" back />

      <MapIllustration className="h-36 w-full" />

      <div className="space-y-md py-md">
        <div className="px-container-margin">
          <h2 className="font-display text-headline-lg-mobile">Pontos de recarga</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Carregadores para veículos elétricos na sua região, com potência e conectores
            disponíveis.
          </p>
        </div>

        <div className="space-y-gutter px-container-margin">
          {(config.loading || points.loading) && <SkeletonList count={2} />}

          {points.error && <ErrorState message={points.error} onRetry={points.reload} />}

          {!config.loading && !enabled && (
            <EmptyState
              icon="ev_charger"
              title="Em breve"
              description="A rede de pontos de recarga ainda não está publicada nesta região. Assim que a cobertura estiver pronta, ela aparece aqui."
            />
          )}

          {enabled && !points.loading && list.length === 0 && (
            <EmptyState
              icon="ev_charger"
              title="Nenhum ponto por perto"
              description="Não encontramos carregadores no raio pesquisado."
            />
          )}

          {enabled &&
            list.map((point) => (
              <article key={point.id} className="pb-card p-md">
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h3 className="truncate text-body-lg font-bold">{point.name}</h3>
                    <p className="mt-0.5 truncate text-body-md text-on-surface-variant">
                      {point.network}
                    </p>
                  </div>
                  <span className="pb-pill shrink-0 bg-tertiary-fixed text-on-tertiary-fixed">
                    <Icon name="electric_bolt" size={14} />
                    {Math.max(...point.connectors.map((c) => c.powerKw))} kW
                  </span>
                </div>

                <p className="mt-sm flex items-center gap-1 text-label-bold font-normal
                              text-on-surface-variant">
                  <Icon name="place" size={16} />
                  {distance(point.distanceKm)} · {point.address}
                </p>

                <ul className="mt-md space-y-1">
                  {point.connectors.map((connector) => {
                    const free = connector.available > 0;
                    return (
                      <li
                        key={connector.type}
                        className="flex items-center justify-between gap-sm rounded-md
                                   bg-surface-container-low px-sm py-2"
                      >
                        <span className="flex items-center gap-sm text-body-md">
                          <Icon name="ev_charger" size={18} className="text-tertiary" />
                          <span>
                            <span className="font-bold">{connector.type}</span>
                            <span className="block text-label-bold font-normal
                                             text-on-surface-variant">
                              Até {connector.powerKw} kW
                            </span>
                          </span>
                        </span>
                        {/* Estado nunca só por cor: ícone + texto acompanham. */}
                        <span
                          className={`pb-pill ${
                            free
                              ? 'bg-primary-fixed text-on-primary-fixed'
                              : 'bg-surface-container-high text-on-surface-variant'
                          }`}
                        >
                          <Icon name={free ? 'check_circle' : 'schedule'} size={14} />
                          {free
                            ? `${connector.available} livre${connector.available > 1 ? 's' : ''}`
                            : 'Em uso'}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pb-btn-secondary mt-md w-full"
                >
                  <Icon name="navigation" size={18} />
                  Navegar até aqui
                </a>
              </article>
            ))}
        </div>
      </div>
    </>
  );
}
