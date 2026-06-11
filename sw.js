/* Service worker for "Unsere Finanzen" — precache app shell, stale-while-revalidate. */
'use strict';

const CACHE = 'unsere-finanzen-v1';

const PRECACHE = [
  './',
  'index.html',
  'css/style.css',
  'manifest.json',
  'js/core.js',
  'js/charts.js',
  'js/analysis.js',
  'js/store.js',
  'js/views/dashboard.js',
  'js/views/transactions.js',
  'js/views/recurring.js',
  'js/views/insights.js',
  'js/views/settings.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

const FIREBASE_CDN_PREFIX = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * Stale-while-revalidate: respond from cache immediately when possible and
 * refresh the cache in the background; otherwise go to the network and cache
 * the result. `fallbackUrl` (e.g. 'index.html' for navigations) is used when
 * both cache and network fail.
 */
function staleWhileRevalidate(event, fallbackUrl) {
  const request = event.request;
  return caches.open(CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const refresh = fetch(request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone());
        }
        return response;
      });
      if (cached) {
        // Serve instantly, keep the SW alive until the background refresh settles.
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }
      return refresh.catch(() => {
        if (fallbackUrl) {
          return cache.match(fallbackUrl);
        }
        return undefined;
      }).then((response) => {
        if (response) {
          return response;
        }
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(staleWhileRevalidate(event, 'index.html'));
    } else {
      event.respondWith(staleWhileRevalidate(event, null));
    }
    return;
  }

  if (request.url.indexOf(FIREBASE_CDN_PREFIX) === 0) {
    event.respondWith(staleWhileRevalidate(event, null));
    return;
  }

  // Everything else (Firestore listen channels, auth endpoints, …):
  // do not intercept — let the browser handle it directly.
});
