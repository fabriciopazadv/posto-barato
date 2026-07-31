'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from './Icon';

interface Tab {
  href: string;
  label: string;
  icon: IconName;
  /** Rotas que também deixam esta aba ativa. */
  matches?: string[];
}

const TABS: Tab[] = [
  { href: '/', label: 'Início', icon: 'home' },
  { href: '/mapa', label: 'Explorar', icon: 'explore', matches: ['/posto', '/recarga'] },
  { href: '/comparador', label: 'Comparar', icon: 'compare_arrows' },
  { href: '/favoritos', label: 'Favoritos', icon: 'favorite' },
  { href: '/perfil', label: 'Perfil', icon: 'person', matches: ['/premium', '/economia'] },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (tab: Tab) => {
    const path = pathname.replace(/\/$/, '') || '/';
    if (tab.href === '/') return path === '/';
    return path === tab.href || (tab.matches?.some((m) => path.startsWith(m)) ?? false);
  };

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant
                 bg-surface-container-lowest/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-screen-sm">
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-touch flex-col items-center justify-center gap-0.5 py-2
                            text-label-bold transition-colors ${
                              active
                                ? 'text-primary'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
              >
                <Icon name={tab.icon} filled={active} size={24} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
