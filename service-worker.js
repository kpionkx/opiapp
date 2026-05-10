const CACHE = 'opi-v3';
const MAX_CACHE_SIZE = 50;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './platform.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      c.addAll(ASSETS)
        .then(() => c.add('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js').catch(() => {}))
        .then(() => c.add('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap').catch(() => {}))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

// Limit cache size to prevent storage abuse
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only cache GET requests from same origin or trusted CDNs
  if (e.request.method !== 'GET') return;
  const trusted = [self.location.origin, 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
  if (!trusted.some(t => url.href.startsWith(t))) return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (!res || res.status !== 200) return res;
      if (res.type === 'opaque') return res;
      const clone = res.clone();
      caches.open(CACHE).then(c => {
        c.put(e.request, clone);
        trimCache(CACHE, MAX_CACHE_SIZE);
      });
      return res;
    }).catch(() => cached))
  );
});
