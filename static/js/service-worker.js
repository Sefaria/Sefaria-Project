self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forces activation
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Claims clients immediately
});

self.addEventListener('fetch', (event) => {
  const {request} = event;
  const documentRequest = request.mode === 'navigate' && request.destination === 'document';
  const url = new URL(event.request.url);
  const {hostname, pathname} = url;
  const isSheetsDomain = hostname === 'sheets.localsefaria.org';
  const isSheetsPath = /^\/sheets($|\/)/.test(pathname); //bot not '/sheets-something'
  if (isSheetsDomain) {
    url.hostname = hostname.replace(/^sheets\./, '');
    if (!isSheetsPath && documentRequest) {
      url.pathname = `/sheets${pathname}`;
    }
    const newRequest = makeNewRequest(request, url);
    event.respondWith(fetch(newRequest).catch(error => {
    }));
  } else {
    event.respondWith(fetch(request));
  }
});

const makeNewRequest = (request, url) => {
  const { method, body, redirect, credentials, cache, referrer, referrerPolicy, integrity, keepalive, mode, signal } = request;
  const requestInit = {
    method,
    headers: new Headers(request.headers),
    body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
    redirect,
    credentials: 'include',
    cache,
    referrer,
    referrerPolicy,
    integrity,
    keepalive,
    signal,
    mode: mode !== 'navigate' ? mode : undefined,
  };
  // If the body is a ReadableStream, set duplex
  const isStreamBody =
    body instanceof ReadableStream ||
    Object.prototype.toString.call(body) === '[object ReadableStream]';
  if (isStreamBody) {
    requestInit.duplex = 'half';
  }
  return new Request(url.toString(), requestInit);
}
