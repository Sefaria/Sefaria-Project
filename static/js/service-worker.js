self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forces activation
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Claims clients immediately
});

self.addEventListener('fetch', async (event) => {
  event.respondWith(handleRequest(event.request));
});

const handleRequest = async (request) => {
  const clonedRequest = request.clone();
  const documentRequest = clonedRequest.mode === 'navigate' && clonedRequest.destination === 'document';
  const url = new URL(clonedRequest.url);
  const {hostname, pathname} = url;
  const isSheetsDomain = /^sheets\..*sefaria\.org(\.il)?/.test(hostname);
  const isSheetsPath = /^\/sheets($|\/)/.test(pathname); //bot not '/sheets-something'
  if (isSheetsDomain) {
    url.hostname = hostname.replace(/^sheets\./, '');
    if (!isSheetsPath && documentRequest) {
      url.pathname = `/sheets${pathname}`;
    }
    const newRequest = await makeNewRequest(clonedRequest, url);
    return fetch(newRequest);
  } else {
    return fetch(request);
  }
};

const makeNewRequest = async (request, url) => {
  const { method, redirect, credentials, cache, referrer, referrerPolicy, integrity, keepalive, mode, signal } = request;
  const body = await getBody(request);
  const requestInit = {
    method,
    headers: new Headers(request.headers),
    body,
    redirect,
    credentials: 'include',
    cache,
    referrer,
    referrerPolicy,
    integrity,
    keepalive,
    signal,
    mode: mode !== 'navigate' ? 'cors' : undefined,
  };
  return new Request(url.toString(), requestInit);
}

const getBody = async (request) => {
  const contentType = request.headers.get("Content-Type") || "";
  if (request.method === 'GET' || request.method === 'HEAD') {
    return;
  }
  if (contentType.includes("application/json")) {
    const json = await request.json();
    return JSON.stringify(json);
  } else if (contentType.includes("text")) {
    return await request.text();
  }
  return await request.blob();
}
