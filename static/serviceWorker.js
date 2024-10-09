
// Install event: cache the files
self.addEventListener('install', event => {
  console.log('Service worker installing...');
});

// Fetch event: respond with cached files if available
self.addEventListener('fetch', event => {
  console.log('Fetch event for ', event.request.url);
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  console.log('Service worker activating...');
});
