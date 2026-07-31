'use client';

import type { PublicStationSummary } from '@posto-barato/shared-types';
import Link from 'next/link';

import { distance, FRESHNESS, money, relativeAge } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';

import { Icon } from './Icon';

interface StationCardProps {
  station: PublicStationSummary;
  /** Menor preço da lista, para destacar quem está entre os mais baratos. */
  cheapestPrice?: number;
  /** Economia por litro frente ao preço mais caro da lista. */
  savingsPerLiter?: number;
}

export function StationCard({ station, cheapestPrice, savingsPerLiter }: StationCardProps) {
  const { isFavorite, toggleFavorite } = usePrefs();
  const price = station.lowestPrice;
  const favorite = isFavorite(station.id);

  // DESIGN.md: preço em verde quando está entre os mais baratos da área.
  const isCheapest = cheapestPrice !== undefined && price?.price === cheapestPrice;
  const dist = distance(station.distanceKm);

  return (
    <article className="pb-card relative">
      <Link
        href={`/posto/?id=${encodeURIComponent(station.id)}`}
        className="block p-md focus-visible:rounded-lg"
      >
        <div className="flex items-start justify-between gap-md">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-body-lg font-bold text-on-surface">{station.name}</h3>
            <p className="mt-0.5 truncate text-body-md text-on-surface-variant">
              {station.neighborhood ?? station.address}
            </p>
          </div>

          {price && (
            <div className="shrink-0 text-right">
              <p
                className={`tabular font-display text-price-display ${
                  isCheapest ? 'text-primary' : 'text-on-surface'
                }`}
              >
                {money(price.price)}
              </p>
              <p className="text-label-bold font-normal text-on-surface-variant">
                {price.productName}
              </p>
            </div>
          )}
        </div>

        <div className="mt-md flex flex-wrap items-center gap-x-md gap-y-1 text-label-bold
                        font-normal text-on-surface-variant">
          {dist && (
            <span className="flex items-center gap-1">
              <Icon name="place" size={16} />
              {dist}
            </span>
          )}
          {price && (
            <span className="flex items-center gap-1">
              <Icon name="schedule" size={16} />
              {relativeAge(price.ageMinutes)}
            </span>
          )}
          {price && (
            <span className={`pb-pill ${FRESHNESS[price.freshness].className}`}>
              {FRESHNESS[price.freshness].label}
            </span>
          )}
          {savingsPerLiter !== undefined && savingsPerLiter > 0 && (
            <span className="pb-pill bg-primary-fixed text-on-primary-fixed">
              <Icon name="savings" size={14} />
              Economia de {money(savingsPerLiter)}/l
            </span>
          )}
        </div>
      </Link>

      <button
        type="button"
        onClick={() => toggleFavorite(station.id)}
        aria-pressed={favorite}
        className="absolute bottom-2 right-2 flex min-h-touch min-w-touch items-center
                   justify-center rounded-full text-on-surface-variant
                   hover:bg-surface-container hover:text-primary"
      >
        <Icon
          name="favorite"
          filled={favorite}
          label={favorite ? `Remover ${station.name} dos favoritos` : `Salvar ${station.name} nos favoritos`}
          className={favorite ? 'text-primary' : ''}
        />
      </button>
    </article>
  );
}
