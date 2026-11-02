// Programeles failai saugomi telefone: pirmiausia imama is tinklo (visada naujausia), be tinklo - is atminties
const CACHE = 'katiline-v2';
const FILES = ['./', './index.html', './app.js', './chart.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
