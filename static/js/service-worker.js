const CACHE_VERSION = 'sefaria-offline-v1';
const NAVIGATION_FALLBACK = '/texts';
const PRECACHE_URLS = [
  NAVIGATION_FALLBACK,
  '/site.webmanifest',
  '/static/js/lib/keyboard.js',
  '/static/js/analyticsEventTracker.js',
  '/static/js/lib/jquery.js',
  '/static/js/lib/jquery-ui.js',
  '/static/js/lib/react.development.js',
  '/static/js/lib/react-dom.development.js',
];

const isSameOrigin = url => url.origin === self.location.origin;

const cacheUrl = (cache, url) => (
  fetch(url, {credentials: 'same-origin'})
    .then(response => {
      if (response.ok) {
        return cache.put(url, response.clone());
      }
    })
    .catch(() => undefined)
);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.all(PRECACHE_URLS.map(url => cacheUrl(cache, url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_VERSION)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'CACHE_URLS') { return; }
  const urls = event.data.urls || [];
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.all(urls.map(url => cacheUrl(cache, url))))
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') { return; }

  const url = new URL(request.url);
  if (!isSameOrigin(url)) { return; }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)
          .then(response => response || caches.match(NAVIGATION_FALLBACK)))
    );
    return;
  }

  if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/data.') || url.pathname.startsWith('/bundles/')) {
    event.respondWith(
      caches.match(request)
        .then(response => response || fetch(request).then(networkResponse => {
          const copy = networkResponse.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
          return networkResponse;
        }))
    );
  }
});
