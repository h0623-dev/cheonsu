// WEB_CACHE_VERSION and WEB_SHELL are supplied by the isolated web build.
const PREFIX = 'cheonsu-safari-';
const SHELL_CACHE = `${PREFIX}shell-${WEB_CACHE_VERSION}`;
const ASSET_CACHE = `${PREFIX}assets-${WEB_CACHE_VERSION}`;
const MAX_ASSETS = 96;
const MAX_ASSET_BYTES = 1024 * 1024;
let writes = Promise.resolve();

self.addEventListener('install', event => {
  // No bulk artwork download. Cache only the executable shell, a few MB at most.
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(WEB_SHELL)));
  // A new worker waits for old game windows to close; never reload a live battle.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX)
      && key !== SHELL_CACHE && key !== ASSET_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function remember(request, response) {
  if (!response.ok || response.status === 206 || response.type !== 'basic') return Promise.resolve();
  const length = Number(response.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0 || length > MAX_ASSET_BYTES) return Promise.resolve();
  const copy = response.clone();
  writes = writes.catch(() => {}).then(async () => {
    const cache = await caches.open(ASSET_CACHE);
    const keys = await cache.keys();
    // Keep runtime payloads below 96 MiB; larger images still load from the network.
    while (keys.length >= MAX_ASSETS) await cache.delete(keys.shift());
    await cache.put(request, copy);
  }).catch(() => { /* A full Safari cache must not interrupt online play. */ });
  return writes;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;
  if (url.pathname === '/healthz' || url.pathname === '/web-release.json'
    || url.pathname.startsWith('/updates/') || /\/(?:sw|service-worker)\.js$/.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    // Existing tabs keep their version; a fresh visit can pick up the next web release.
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match('/index.html', { cacheName: SHELL_CACHE })) || Response.error()));
    return;
  }

  if (!/\.(?:js|css|png|jpe?g|svg|webp|gif|woff2?|mp3|ogg|wav|webmanifest)$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request, { cacheName: SHELL_CACHE })
      || await caches.match(request, { cacheName: ASSET_CACHE });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      event.waitUntil(remember(request, response));
      return response;
    } catch {
      return Response.error();
    }
  })());
});
