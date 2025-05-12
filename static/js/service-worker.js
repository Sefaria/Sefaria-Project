self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forces activation
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Claims clients immediately
});

self.addEventListener('fetch', async (event) => {
  const clonedRequest = event.request.clone();
  const documentRequest = clonedRequest.mode === 'navigate' && clonedRequest.destination === 'document';
  const url = new URL(clonedRequest.url);
  let {hostname, pathname} = url;
  const isSheetsDomain = hostname === 'sheets.localsefaria.org';
  const isSheetsPath = /^\/sheets($|\/)/.test(pathname); //bot not '/sheets-something'
  const isAlreadyRedirect = /^\/redirect($|\/)/.test(pathname); //i think this happens somehow due cache
  const isApi = /^\/api($|\/)/.test(pathname); //TODO - this is hack so nginx will handle it
  if (isSheetsDomain && !isAlreadyRedirect && !isApi) {
    if (!isSheetsPath && documentRequest) {
      pathname = `/sheets${pathname}`;
    }
    url.pathname = `/redirect${pathname}`;
    const newRequest = await makeNewRequest(clonedRequest, url);
    event.respondWith(fetch(newRequest));
  } else {
    event.respondWith(fetch(event.request));
  }
});

const makeNewRequest = async (request, url) => {
  const { method, redirect, credentials, cache, referrer, referrerPolicy, integrity, keepalive, mode, signal } = request;
  const body = await getBody(request);
  const requestInit = {
    method,
    headers: new Headers(request.headers),
    body,
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
  return new Request(url.toString(), requestInit);
}

const getBody = async (request) => {
  const contentType = request.headers.get("Content-Type") || "";
  if (request.method === 'GET' || request.method === 'HEAD') {
    return;
  }
  if (contentType.includes("application/json")) {
    return await request.json();
  } else if (contentType.includes("text")) {
    return await request.text();
  }
  return await request.blob();
}
