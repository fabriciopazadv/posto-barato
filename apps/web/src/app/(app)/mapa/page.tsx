'use client';

import type { StationSort } from '@posto-barato/shared-types';
import Link from 'next/link';
import { useState } from 'react';

import { FuelChips } from '@/components/FuelChips';
import { Icon } from '@/components/Icon';
import { MapIllustration } from '@/components/MapIllustration';
import { StationCard } from '@/components/StationCard';
import { TopBar } from '@/components/TopBar';
import { Chip, EmptyState, ErrorState, Notices, SkeletonList } from '@/components/ui';
import { getConfig, getProducts, getStations } from '@/lib/data';
import { usePrefs } from '@/lib/prefs';
import { useAsync } from '@/lib/useAsync';

const SORTS: { value: StationSort; label: string }[] = [
  { value: 'lowest_price', label: 'Menor preço' },
  { value: 'nearest', label: 'Mais perto' },
  { value: 'most_recent', label: 'Atualizado há menos tempo' },
];

export default function MapaPage() {
  const { product, setProduct, origin } = usePrefs();
  const [sort, setSort] = useState<StationSort>('lowest_price');
  const [search, setSearch] = useState('');
  const [showMap, setShowMap] = useState(true);

  const config = useAsync(() => getConfig(), []);
  const products = useAsync(() => getProducts(), []);

  const stations = useAsync(
    () =>
      getStations({
        product,
        search: search.trim() || undefined,
        // `nearest` exige origem (docs/api/endpoints.md).
        sort: sort === 'nearest' && !origin ? 'lowest_price' : sort,
        latitude: origin?.latitude,
        longitude: origin?.longitude,
        limit: 50,
      }),
    [product, sort, search, origin?.latitude, origin?.longitude],
  );

  const list = stations.data?.data ?? [];
  const cheapest = list.length
    ? Math.min(...list.map((s) => s.lowestPrice?.price ?? Infinity))
    : undefined;

  return (
    <>
      <TopBar
        title="Postos"
        action={
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-full
                       text-on-surface-variant hover:bg-surface-container"
          >
            <Icon
              name={showMap ? 'format_list_bulleted' : 'map'}
              label={showMap ? 'Ver como lista' : 'Ver no mapa'}
            />
          </button>
        }
      />

      <div className="space-y-md py-md">
        <div className="px-container-margin">
          <label className="sr-only" htmlFor="busca">
            Buscar posto, bairro ou endereço
          </label>
          <div className="relative">
            <Icon
              name="search"
              size={20}
              className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2
                         text-on-surface-variant"
            />
            <input
              id="busca"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar posto, bairro ou endereço"
              className="pb-input pl-12"
            />
          </div>
        </div>

        {products.data && (
          <div className="px-container-margin">
            <FuelChips products={products.data} selected={product} onSelect={setProduct} />
          </div>
        )}

        <div className="hide-scrollbar flex gap-sm overflow-x-auto px-container-margin">
          {SORTS.map((option) => (
            <Chip
              key={option.value}
              active={sort === option.value}
              onClick={() => setSort(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>

        {showMap && (
          <div className="px-container-margin">
            <div className="relative overflow-hidden rounded-lg border border-outline-variant">
              <MapIllustration className="h-48 w-full" />
              <div className="absolute inset-0 flex items-end justify-between gap-sm
                              bg-gradient-to-t from-surface-container-lowest/90 to-transparent p-md">
                <p className="text-label-bold font-normal text-on-surface">
                  {list.length} {list.length === 1 ? 'posto encontrado' : 'postos encontrados'}
                </p>
                <span className="pb-pill bg-surface-container-lowest text-on-surface-variant">
                  Mapa interativo em breve
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-gutter px-container-margin">
          {stations.loading && <SkeletonList count={4} />}
          {stations.error && <ErrorState message={stations.error} onRetry={stations.reload} />}

          {!stations.loading && !stations.error && list.length === 0 && (
            <EmptyState
              icon="search"
              title="Nada por aqui"
              description={
                search
                  ? `Nenhum posto corresponde a "${search}".`
                  : 'Nenhum posto com preço recente para este combustível.'
              }
            />
          )}

          {list.map((station) => (
            <StationCard key={station.id} station={station} cheapestPrice={cheapest} />
          ))}
        </div>

        <div className="px-container-margin">
          <Link
            href="/recarga"
            className="pb-card flex items-center gap-md p-md hover:bg-surface-container-low"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md
                             bg-tertiary-fixed text-on-tertiary-fixed">
              <Icon name="ev_charger" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body-lg font-bold">Carro elétrico?</span>
              <span className="block text-body-md text-on-surface-variant">
                Veja os pontos de recarga da região.
              </span>
            </span>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </Link>
        </div>

        <div className="px-container-margin">
          <Notices notices={config.data?.notices ?? []} />
        </div>
      </div>
    </>
  );
}
