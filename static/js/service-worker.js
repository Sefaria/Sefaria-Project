self.addEventListener('fetch', (event) => {
  const {request} = event;
  const documentRequest = request.mode === 'navigate' && request.destination === 'document';
  const url = new URL(event.request.url);
  const sheetsDomain = url.hostname === 'sheets.localsefaria.org';
  const sheetsPath = url.pathname.startsWith('/sheets');

  if (sheetsDomain) {
    url.hostname = url.hostname.replace(/^sheets\./, '');
    if (!sheetsPath && documentRequest) {
      url.pathname = `/sheets${url.pathname}`;
    }
    const newRequest = makeNewRequest(request, url);
    event.respondWith(fetch(newRequest));
  } else {
    event.respondWith(fetch(request));
  }
});

const makeNewRequest = (request, url) => {
  const { method, headers, body, redirect, credentials, cache, referrer, referrerPolicy, integrity, keepalive, mode, signal } = request;
  const requestInit = {
    method,
    headers,
    body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
    redirect,
    credentials,
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
