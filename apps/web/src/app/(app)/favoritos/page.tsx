'use client';

import Link from 'next/link';

import { StationCard } from '@/components/StationCard';
import { TopBar } from '@/components/TopBar';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { getStations } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { useAsync } from '@/lib/useAsync';

export default function FavoritosPage() {
  const { favorites, product, origin, ready } = usePrefs();

  const stations = useAsync(
    () =>
      getStations({
        product,
        latitude: origin?.latitude,
        longitude: origin?.longitude,
        limit: 50,
      }),
    [product, origin?.latitude, origin?.longitude],
  );

  const list = (stations.data?.data ?? []).filter((s) => favorites.includes(s.id));
  const cheapest = list.length
    ? Math.min(...list.map((s) => s.lowestPrice?.price ?? Infinity))
    : undefined;

  return (
    <>
      <TopBar title="Favoritos" />

      <div className="space-y-md py-md">
        <p className="px-container-margin text-body-md text-on-surface-variant">
          Seus postos salvos ficam neste dispositivo. Quando as contas estiverem disponíveis,
          eles passam a sincronizar.
        </p>

        <div className="space-y-gutter px-container-margin">
          {(!ready || stations.loading) && <SkeletonList count={2} />}

          {stations.error && <ErrorState message={stations.error} onRetry={stations.reload} />}

          {ready && !stations.loading && !stations.error && list.length === 0 && (
            <EmptyState
              icon="favorite"
              title="Nenhum favorito ainda"
              description="Toque no coração de um posto para salvá-lo aqui e acompanhar o preço."
              action={
                <Link href="/mapa" className="pb-btn-primary mt-sm">
                  Ver postos
                </Link>
              }
            />
          )}

          {list.map((station) => (
            <StationCard key={station.id} station={station} cheapestPrice={cheapest} />
          ))}
        </div>
      </div>
    </>
  );
}
