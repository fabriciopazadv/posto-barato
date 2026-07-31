/**
 * Service worker do Posto Barato.
 *
 * Estratégias:
 * - Navegação  → rede primeiro, cache como reserva, /offline/ em último caso.
 *   Rede primeiro porque o app é sobre preço atual: servir uma tela cacheada
 *   quando há rede mostraria preço velho, que é o pior erro possível aqui.
 * - Estáticos  → cache primeiro (fontes, ícones, JS/CSS com hash no nome).
 * - API        → nunca cacheada. Preço vencido em cache é pior que sem dado.
 */
const VERSION = 'v1';
const SHELL_CACHE = `posto-barato-shell-${VERSION}`;
const ASSET_CACHE = `posto-barato-assets-${VERSION}`;

const SHELL = ['/', '/offline/', '/manifest.webmanifest', '/assets/img/logo-mark.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `addAll` falha inteiro se um item falhar; individualmente é mais robusto.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('posto-barato-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Só lidamos com o próprio domínio: a API pode estar em outra origem e nunca
  // deve ser cacheada.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? (await caches.match('/offline/')) ?? Response.error();
        }),
    );
    return;
  }

  if (/\.(?:woff2|png|svg|webp|css|js|json)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
