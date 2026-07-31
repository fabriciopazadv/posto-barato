import type { PriceFreshness } from '@posto-barato/shared-types';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const brlPrecise = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function money(value: number): string {
  return brl.format(value);
}

/** Preço por litro com 3 casas, como nas bombas. */
export function pricePerUnit(value: number, unit: string): string {
  return `${brlPrecise.format(value)}/${unit === 'M3' ? 'm³' : unit.toLowerCase()}`;
}

export function distance(km: number | null): string | null {
  if (km === null) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${decimal.format(km)} km`;
}

/**
 * Texto relativo do frescor. Nunca afirma tempo real — a fonte não é
 * atualizada em tempo real (docs/security/data-boundaries.md).
 */
export function relativeAge(ageMinutes: number): string {
  if (ageMinutes < 1) return 'agora há pouco';
  if (ageMinutes < 60) return `há ${ageMinutes} min`;
  const hours = Math.round(ageMinutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

interface FreshnessStyle {
  label: string;
  className: string;
}

export const FRESHNESS: Record<PriceFreshness, FreshnessStyle> = {
  RECENT: { label: 'Recente', className: 'bg-primary-fixed text-on-primary-fixed' },
  MODERATE: { label: 'Moderado', className: 'bg-tertiary-fixed text-on-tertiary-fixed' },
  OLD: { label: 'Antigo', className: 'bg-secondary-fixed text-on-secondary-fixed' },
  EXPIRED: { label: 'Desatualizado', className: 'bg-error-container text-on-error-container' },
};

export function percent(value: number): string {
  return `${decimal.format(value)}%`;
}
