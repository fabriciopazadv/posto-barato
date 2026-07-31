import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { ServiceWorker } from '@/components/ServiceWorker';
import { PrefsProvider } from '@/lib/prefs';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Posto Barato — compare preços de combustível',
    template: '%s · Posto Barato',
  },
  description:
    'Encontre os postos mais baratos perto de você, compare o custo real considerando o deslocamento e acompanhe sua economia.',
  applicationName: 'Posto Barato',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Posto Barato', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/assets/img/logo-mark.svg', type: 'image/svg+xml' }],
    apple: '/assets/img/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#006c49' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1720' },
  ],
};

/**
 * Aplica o tema salvo antes da primeira pintura. Sem isto, o app abriria no
 * tema claro e piscaria para o escuro depois da hidratação — desagradável à
 * noite, que é justamente quando o modo escuro importa.
 */
const THEME_BOOTSTRAP = `
try {
  var p = JSON.parse(localStorage.getItem('posto-barato:prefs:v1') || '{}');
  if (p.theme === 'dark' || p.theme === 'light') {
    document.documentElement.classList.add(p.theme);
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/assets/fonts/inter-latin-f11d729b.woff2"
          as="font"
          type="font/woff2"
          crossOrigin=""
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50
                     focus:rounded-md focus:bg-primary focus:px-md focus:py-2 focus:text-on-primary"
        >
          Pular para o conteúdo
        </a>
        <PrefsProvider>{children}</PrefsProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
