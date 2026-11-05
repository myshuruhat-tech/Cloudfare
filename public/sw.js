const CACHE_NAME = 'live-screen-v192';
const APP_SHELL = ['./', './index.html', './app.html', './manifest.json', './icon-192.png', './icon-512.png', './logo-art.png', './cairo.woff'];
// Third-party assets cached on first load so the app still works when the CDN
// is blocked or the TV's connection is weak.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/hls.js@1'
];
const IMG_CACHE = 'live-screen-img-v2';
const IMG_MAX = 400;      // real (CORS) copies only — small, so this stays cheap on quota
const noCors = new Set(); // origins whose CDN refuses CORS reads: we leave those pictures alone (an opaque copy would eat quota)
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(APP_SHELL.map((u) => cache.add(u).catch(() => {})));
      await Promise.all(CDN_ASSETS.map((u) => cache.add(u).catch(() => {})));
      // optional local copy of hls.js, cached only if the file exists
      await cache.add('./hls.min.js').catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== IMG_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Pictures from other sites (Kick avatars, stream/clip thumbnails): network first, so they stay fresh; when the network
// is slow (2.5s) or fails, the last good copy is shown instead of a blank tile. Every successful load refreshes the copy.
async function imgFetch(event, req) {
  const origin = new URL(req.url).origin;
  if (noCors.has(origin)) return fetch(req);
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req.url);
  const fresh = (async () => {
    try {
      const res = await fetch(req.url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (res && res.ok) {
        await cache.put(req.url, res.clone());
        if (Math.random() < 0.05) {
          const keys = await cache.keys();
          if (keys.length > IMG_MAX) await Promise.all(keys.slice(0, keys.length - IMG_MAX).map((k) => cache.delete(k)));
        }
        return res;
      }
    } catch (e) { /* CORS refused or offline: handled below */ }
    return null;
  })();
  event.waitUntil(fresh.catch(() => {}));
  if (hit) return Promise.race([fresh.then((r) => r || hit), new Promise((ok) => setTimeout(() => ok(hit), 2500))]);
  const r = await fresh;
  if (r) return r;
  const plain = await fetch(req);           // behave exactly like before; if this works the CDN just doesn't allow CORS
  if (plain && (plain.ok || plain.type === 'opaque')) noCors.add(origin);
  return plain;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions')) return; // never cache API calls

  if (req.destination === 'image' && url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
    event.respondWith(imgFetch(event, req));
    return;
  }

  // CDN scripts and fonts: cache-first, refresh in background.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== location.origin) return; // other cross-origin (streams, APIs): leave alone

  // The page itself (index.html): network-first so a new deploy shows up on the very next
  // open; falls back to the cached copy if the network is slow (1.5s) or offline.
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/app.html')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return response;
        });
        if (!hit) return net;
        const timeout = new Promise((resolve) => setTimeout(() => resolve(hit), 1500));
        return Promise.race([net.catch(() => hit), timeout]);
      })
    );
    return;
  }

  // Own files: stale-while-revalidate — show the cached copy instantly,
  // refresh it in the background (new version appears on the next open).
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
