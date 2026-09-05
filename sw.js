/* Cache only public app assets. Broker/cloud API responses are never intercepted. */
const CACHE = 'trade-journal-web-shell-v1';
const BASE = new URL('./', self.location.href);
const FILES = ['index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'app/theme.css', 'app/data.js', 'app/stats.js', 'app/sync.js', 'app/portfolio.js', 'app/local-backup.js',
  'app/broker-feed.js', 'app/pwa.js', 'app/charts.jsx', 'app/components.jsx', 'app/assets-panel.jsx',
  'app/networth-card.jsx', 'app/modals.jsx', 'app/restore-modal.jsx', 'app/dashboard.jsx', 'app/hero.jsx',
  'app/broker-panel.jsx', 'app/main.jsx'];
const RUNTIME = ['https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js'];
const ALLOWED = new Set([...FILES.map(f => new URL(f, BASE).href), ...RUNTIME]);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...ALLOWED])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('trade-journal-web-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  let key = url.href;
  if (url.origin === BASE.origin && url.pathname.startsWith(BASE.pathname)) {
    url.search = ''; url.hash = '';
    if (url.pathname === BASE.pathname) url.pathname += 'index.html';
    key = url.href;
  }
  if (!ALLOWED.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) { await cache.put(key, response.clone()); return response; }
      return (await cache.match(key)) || response;
    } catch {
      return (await cache.match(key)) || new Response('인터넷에 연결한 뒤 다시 열어 주세요.', { status: 503 });
    }
  })());
});
