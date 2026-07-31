'use client';

import type { Product } from '@posto-barato/shared-types';

import { Chip } from './ui';

/** Lista horizontal de combustíveis (DESIGN.md: chips de seleção em pílula). */
export function FuelChips({
  products,
  selected,
  onSelect,
}: {
  products: Product[];
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Combustível"
      className="hide-scrollbar -mx-container-margin flex gap-sm overflow-x-auto
                 px-container-margin pb-1"
    >
      {products.map((product) => (
        <Chip
          key={product.code}
          active={product.code === selected}
          onClick={() => onSelect(product.code)}
        >
          {product.name}
        </Chip>
      ))}
    </div>
  );
}
