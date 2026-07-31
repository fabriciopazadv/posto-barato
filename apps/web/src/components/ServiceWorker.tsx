'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker.
 *
 * Só em produção: em desenvolvimento, um SW ativo serve build antigo do cache
 * e faz parecer que a edição não pegou.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Falha no registro não pode derrubar o app — ele funciona sem SW.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
