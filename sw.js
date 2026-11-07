/* Aumentar VERSION al publicar cambios; las cachés están aisladas por ruta de la app. */
const VERSION = '1.2.0';
const PREFIX = `serie:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}${VERSION}`;
const ASSETS = [
  './', './index.html', './css/styles.css', './js/core.js', './js/db.js', './js/icons.js',
  './js/alerts.js', './js/pwa.js', './js/app.js', './js/clocks.js', './manifest.webmanifest',
  './icons/favicon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png', './icons/apple-touch-icon.png'
];
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const cleanURL = new URL(url); cleanURL.search = ''; cleanURL.hash = '';
  const home = new URL('./', self.registration.scope).pathname;
  if (event.request.mode === 'navigate' && (url.pathname === home || url.pathname === `${home}index.html`)) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match(new URL('./index.html', self.registration.scope));
      return cached || fetch(event.request);
    })());
  } else if (assetURLs.has(cleanURL.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(cleanURL.href)) || fetch(event.request);
    })());
  }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const existing = clients.find(client => client.url.startsWith(self.registration.scope));
    if (existing) return existing.focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
