self.addEventListener('fetch', (event) => {
  const navigationEntries = performance.getEntriesByType('navigation');
  const isReload = navigationEntries.length && navigationEntries[0].type === 'reload';
  const url = new URL(event.request.url);

  if (!isReload && url.hostname === 'sheets.localsefaria.org') {  //this should be generalized for org.il, cauldrons, local host etc.
    url.hostname = url.hostname.replace(/^sheets\./, '');
    const newRequest = new Request(url.toString(), event.request);
    event.respondWith(fetch(newRequest));
  } else {
    event.respondWith(fetch(event.request));
  }
});
