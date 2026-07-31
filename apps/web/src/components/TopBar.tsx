'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { Icon } from './Icon';

interface TopBarProps {
  title: string;
  /** Mostra o botão voltar em vez da logo. */
  back?: boolean;
  action?: ReactNode;
  /** Título some visualmente mas continua para leitores de tela. */
  transparent?: boolean;
}

export function TopBar({ title, back = false, action, transparent = false }: TopBarProps) {
  const router = useRouter();

  return (
    <header
      className={`sticky top-0 z-30 flex min-h-touch items-center gap-sm px-container-margin py-2
                  ${
                    transparent
                      ? 'bg-transparent'
                      : 'border-b border-outline-variant bg-surface-container-lowest/95 backdrop-blur'
                  }`}
    >
      {back ? (
        <button
          type="button"
          onClick={() => router.back()}
          className="-ml-2 flex min-h-touch min-w-touch items-center justify-center
                     rounded-full text-on-surface hover:bg-surface-container"
        >
          <Icon name="arrow_back" label="Voltar" />
        </button>
      ) : (
        <Link href="/" className="flex items-center gap-sm" aria-label="Posto Barato — início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/img/logo-mark.svg" alt="" width={28} height={28} />
        </Link>
      )}

      <h1 className="flex-1 truncate font-display text-headline-md">{title}</h1>

      {action}
    </header>
  );
}
