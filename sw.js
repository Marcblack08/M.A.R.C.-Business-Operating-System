const CACHE_NAME = 'marc-pwa-v11-catalog-v1';
const APP_SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest', '/icons/marc.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);

      if ((response.headers.get('content-type') || '').includes('text/html') && new URL(request.url).pathname.endsWith('/index.html')) {
        const html = await response.text();
        const withoutOldCatalogReaders = html.replace(/<script[^>]+catalogos-(?:fast|v3|v4|paginas|ocr|tablas|v9)\.js[^>]*><\/script>/gi, '');
        const injected = withoutOldCatalogReaders.includes('catalogos.js')
          ? withoutOldCatalogReaders
          : withoutOldCatalogReaders.replace('</body>', '<script src="./catalogos.js?v=v1"></script></body>');

        return new Response(injected, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            ...Object.fromEntries(response.headers),
            'content-type': 'text/html; charset=UTF-8',
            'cache-control': 'no-store'
          }
        });
      }

      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      return response;
    } catch (e) {
      return caches.match(request).then(cached => cached || caches.match('/index.html'));
    }
  })());
});
