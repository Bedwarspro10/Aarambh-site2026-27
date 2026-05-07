/* ═══════════════════════════════════════════════════
   Next Toppers - Feed | Service Worker
   Version: 2.0.0 — Secure / Safe-Browsing compliant
═══════════════════════════════════════════════════ */

const STATIC_CACHE = 'nt-static-v2';
const DYNAMIC_CACHE = 'nt-dynamic-v2';
const ALL_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];

/* Local assets to pre-cache on install */
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
];

/*
 * External origins that must NEVER be intercepted.
 * This prevents breaking Firebase auth, Google APIs,
 * YouTube embeds, and CDN fonts/icons.
 */
const BYPASS_HOSTNAMES = [
  'firebaseapp.com',
  'firebasestorage.googleapis.com',
  'googleapis.com',
  'gstatic.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'accounts.google.com',
  'youtube.com',
  'www.youtube.com',
  'ytimg.com',
  'i.ytimg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'postimg.cc',
  'flaticon.com',
];

/** Returns true if this request should be passed straight to the network */
function shouldBypass(url) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return true;
  return BYPASS_HOSTNAMES.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
}

/* ── INSTALL ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(PRECACHE_ASSETS).catch(() => {
        /* Silently ignore if offline at install time */
      })
    )
  );
});

/* ── ACTIVATE ── clean up old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !ALL_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Pass through all external / non-local origins without touching them
  if (shouldBypass(url)) return;

  // Only intercept same-origin requests from here on
  if (url.origin !== self.location.origin) return;

  /* Navigation (page load) → Network first, fall back to cached index.html */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(cached => cached || caches.match('/'))
        )
    );
    return;
  }

  /* Same-origin static assets → Cache first, then network */
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // Only cache valid, non-opaque same-origin responses
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // No fallback for non-navigation assets — just fail gracefully
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});

/* ── MESSAGE HANDLER ── */
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});
