import type { ReactNode } from 'react';

import { BottomNav } from '@/components/BottomNav';

/**
 * Shell das abas principais. O onboarding e o login ficam fora deste grupo:
 * são fluxos de tela cheia, sem navegação inferior.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col">
      {/* pb-24 reserva a altura da navegação inferior fixa. */}
      <main id="conteudo" className="flex-1 pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
