importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

// Define your cache name
const CACHE = "pwabuilder-page";

// Replace this with the actual offline page
const offlineFallbackPage = "/";

// Workbox Precache and Routing
workbox.precaching.precacheAndRoute([
  { url: '/', revision: '1' },
  { url: '/index.html', revision: '1' },
  { url: '/styles.css', revision: '1' },
  { url: '/script.js', revision: '1' },
  { url: '/icon.png', revision: '1' },
  { url: `/${offlineFallbackPage}`, revision: '1' }
]);

// Fallback for offline page
self.addEventListener('install', async event => {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll([
        offlineFallbackPage,
        '/index.html',
        '/styles.css',
        '/script.js',
        '/icon.png'
      ]);
    })
  );
  self.skipWaiting();
});

// Fetch event to serve from cache or fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request).catch(() => {
        // If both fail, show the offline fallback page
        return caches.match(offlineFallbackPage);
      });
    })
  );
});

// Activate the new service worker and clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE];
  event.waitUntil(
    caches.keys().then(keyList =>
      Promise.all(
        keyList.map(key => {
          if (!cacheWhitelist.includes(key)) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});
