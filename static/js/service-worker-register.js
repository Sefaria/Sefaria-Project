if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/service-worker.js', {scope: '/'})
    .then((registration) => {
      console.log('[SW] Registered with scope:', registration.scope);
    })
    .catch((error) => {
      console.error('[SW] Registration failed:', error);
    });
}
