'use client';

import Link from 'next/link';

import { Icon } from '@/components/Icon';

export default function OfflinePage() {
  return (
    <main
      id="conteudo"
      className="mx-auto flex min-h-dvh max-w-screen-sm flex-col items-center justify-center
                 gap-md px-container-margin text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
        <Icon name="wifi_off" size={32} className="text-on-surface-variant" />
      </span>

      <h1 className="font-display text-headline-lg-mobile">Você está sem conexão</h1>

      <p className="max-w-sm text-body-lg text-on-surface-variant">
        Preços de combustível mudam o tempo todo, então preferimos não mostrar um valor
        possivelmente vencido. Assim que a conexão voltar, os dados são recarregados.
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="pb-btn-primary mt-sm"
      >
        <Icon name="refresh" size={18} />
        Tentar de novo
      </button>

      <Link href="/" className="pb-btn-ghost">
        Ir para o início
      </Link>
    </main>
  );
}
