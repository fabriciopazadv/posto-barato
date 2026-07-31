'use client';

import type { ReactNode } from 'react';

import { Icon, type IconName } from './Icon';

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-container-margin">
      <div className="mb-gutter flex items-center justify-between gap-sm">
        <h2 className="font-display text-headline-md">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-sm rounded-lg border border-dashed
                    border-outline-variant px-lg py-xl text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
        <Icon name={icon} size={28} className="text-on-surface-variant" />
      </span>
      <p className="font-display text-headline-md">{title}</p>
      <p className="max-w-sm text-body-md text-on-surface-variant">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg bg-error-container px-md py-lg text-center">
      <Icon name="error" size={28} className="text-on-error-container" />
      <p className="mt-sm text-body-md text-on-error-container">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="pb-btn-primary mt-md">
          <Icon name="refresh" size={18} />
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/** Esqueleto com a forma do card de posto (DESIGN.md: pulse em bloco cinza). */
export function StationCardSkeleton() {
  return (
    <div className="pb-card p-md" aria-hidden="true">
      <div className="flex items-start justify-between gap-md">
        <div className="flex-1 space-y-2">
          <div className="pb-skeleton h-4 w-2/3" />
          <div className="pb-skeleton h-3 w-1/2" />
        </div>
        <div className="pb-skeleton h-8 w-20" />
      </div>
      <div className="pb-skeleton mt-md h-3 w-1/3" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-gutter">
      {Array.from({ length: count }, (_, i) => (
        <StationCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Avisos obrigatórios da seção 2 da especificação: o preço não é oficial nem
 * em tempo real. Aparecem sempre que preços são exibidos.
 */
export function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <aside className="rounded-md bg-surface-container px-md py-sm">
      <ul className="space-y-1">
        {notices.map((notice) => (
          <li key={notice} className="flex gap-sm text-label-bold text-on-surface-variant">
            <Icon name="info" size={16} className="mt-px shrink-0" />
            <span className="font-normal leading-4">{notice}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`pb-pill min-h-[40px] whitespace-nowrap border transition-colors ${
        active
          ? 'border-secondary bg-secondary text-on-secondary'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
      }`}
    >
      {children}
    </button>
  );
}
