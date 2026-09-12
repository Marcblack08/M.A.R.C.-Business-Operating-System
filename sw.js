const CACHE_NAME = 'marc-pwa-v15-catalog-stable';
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

      // HTML siempre viene de red. El Service Worker ya no modifica index.html
      // ni inyecta lectores de catálogos: index.html es la única fuente de scripts.
      if ((response.headers.get('content-type') || '').includes('text/html')) {
        return response;
      }

      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
      return response;
    } catch (e) {
      const cached = await caches.match(request);
      return cached || caches.match('/index.html');
    }
  })());
});
