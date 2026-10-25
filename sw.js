// Third Eye service worker.
// Bump CACHE_VERSION on every deploy (keep it in sync with VERSION in app.js).
// Strategy: network-first for the app's own files with a 4 s timeout, falling back to the
// versioned cache when offline. Requests to other origins are never touched.
const CACHE_VERSION = 'v1.1.1';
const CACHE = 'third-eye-' + CACHE_VERSION;
const SHELL = [
  './', './styles.css', './app.js', './store.js', './manifest.json',
  './data/tools.json', './data/usernames.json', './data/brokers.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('third-eye-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // never touch other origins
  const key = req.mode === 'navigate' ? './' : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await Promise.race([
        fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000)),
      ]);
      if (net && net.ok) cache.put(key, net.clone());
      return net;
    } catch {
      const hit = await cache.match(key, { ignoreSearch: true });
      return hit || (req.mode === 'navigate' ? cache.match('./') : Response.error());
    }
  })());
});
