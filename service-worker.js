/* ═══════════════════════════════════════════════════
   Next Toppers - Feed | Service Worker
   Version: 1.0.0
═══════════════════════════════════════════════════ */

const CACHE_NAME = 'nt-feed-v1';
const STATIC_CACHE = 'nt-static-v1';
const DYNAMIC_CACHE = 'nt-dynamic-v1';

/* Assets to pre-cache on install */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
];

/* External origins we should NEVER cache (Firebase, Google APIs) */
const BYPASS_ORIGINS = [
  'firebaseapp.com',
  'firebasestorage.googleapis.com',
  'googleapis.com',
  'gstatic.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'postimg.cc',
  'youtube.com',
  'ytimg.com',
  'flaticon.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

/* ── INSTALL ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        /* Silently fail if offline at install time */
      });
    })
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* Always bypass non-GET and Firebase/Google auth requests */
  if (request.method !== 'GET') return;
  if (BYPASS_ORIGINS.some(origin => url.hostname.includes(origin))) return;
  if (url.protocol === 'chrome-extension:') return;

  /* Navigation requests → Network first, fall back to cached index.html */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(cached => cached || caches.match('/'))
        )
    );
    return;
  }

  /* Same-origin static assets → Cache first, then network */
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  /* Everything else → Network only (live data) */
  event.respondWith(fetch(request));
});

/* ── MESSAGE HANDLER (for manual cache busting) ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});
