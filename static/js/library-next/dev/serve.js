#!/usr/bin/env node
/**
 * Library Next dev harness: serves the shell (a static equivalent of templates/library_next/app.html)
 * and the built bundle on http://localhost:8787, and proxies the data layer to a live Sefaria.
 * No Django, no Mongo, no Node SSR. Run `npm run build-library-next` (or watch-library-next) first.
 *
 *   npm run library-next-dev                 # http://localhost:8787
 *   PORT=9000 UPSTREAM=https://mf3.cauldron.sefaria.org npm run library-next-dev
 *
 * Routes
 *   /                 shell (any non-proxied GET path renders the shell; the SPA routes it)
 *   ?lang=he|en       interface language for this load (also sets the interfaceLang cookie)
 *   ?cdn=1 / CDN=1    include the Google Fonts/Typekit links (off by default so the page is self-contained)
 *   /interface/<language>?next=   sets the classic interfaceLang cookie and redirects (as Django does)
 *   /static/bundles/client-library-next/*   the local build
 *   /static/*         local static/ first, then upstream
 *   /vendor/*         React, ReactDOM and jQuery from node_modules (what the CDNs serve in production)
 *   /api/*, /_api/*, /data*.js, /searchapi/*, /site.webmanifest   proxied to UPSTREAM (data.js cached in memory)
 *
 * Egress honours HTTPS_PROXY (CONNECT tunnel, core modules only) and NODE_EXTRA_CA_CERTS
 * (default /root/.ccr/ca-bundle.crt when present).
 */
const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '../../../..');
const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = new URL(process.env.UPSTREAM || 'https://www.sefaria.org');
const STATS = path.join(ROOT, 'node/webpack-stats.client-library-next.json');
const BUNDLE_DIR = path.join(ROOT, 'static/bundles/client-library-next');
const PROXIED_PREFIXES = ['/api/', '/_api/', '/searchapi/', '/data', '/site.webmanifest', '/apple-app-site-association'];
const CA_BUNDLE = process.env.NODE_EXTRA_CA_CERTS || (fs.existsSync('/root/.ccr/ca-bundle.crt') ? '/root/.ccr/ca-bundle.crt' : null);
const CA = CA_BUNDLE && fs.existsSync(CA_BUNDLE) ? [...tls.rootCertificates, fs.readFileSync(CA_BUNDLE, 'utf8')] : undefined;
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;

const VENDOR = {
  '/vendor/react.js': 'react/umd/react.development.js',
  '/vendor/react-dom.js': 'react-dom/umd/react-dom.development.js',
  '/vendor/jquery.js': 'jquery/dist/jquery.js',
};

const MIME = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function bundleFile() {
  try {
    const stats = JSON.parse(fs.readFileSync(STATS, 'utf8'));
    const main = (stats.chunks && stats.chunks.main) || [];
    const name = main.map(c => (typeof c === 'string' ? c : c.name)).find(n => /\.js$/.test(n));
    if (name) { return name; }
  } catch (e) { /* fall through */ }
  const files = fs.existsSync(BUNDLE_DIR) ? fs.readdirSync(BUNDLE_DIR).filter(f => /^client-library-next-.*\.js$/.test(f)) : [];
  return files.sort((a, b) => fs.statSync(path.join(BUNDLE_DIR, b)).mtimeMs - fs.statSync(path.join(BUNDLE_DIR, a)).mtimeMs)[0] || null;
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  });
  return out;
}

function interfaceLang(req, url) {
  const q = url.searchParams.get('lang');
  if (q === 'he' || q === 'hebrew') { return 'hebrew'; }
  if (q === 'en' || q === 'english') { return 'english'; }
  return cookies(req).interfaceLang === 'hebrew' ? 'hebrew' : 'english';
}

function escapeJson(obj) {
  // json_script semantics: safe inside a <script type="application/json">
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function shellHtml(req, url, bundle) {
  const lang = interfaceLang(req, url);
  const he = lang === 'hebrew';
  const cdn = url.searchParams.get('cdn') === '1' || process.env.CDN === '1';
  const props = {
    _uid: null, _email: '', full_name: '', slug: '', is_moderator: false, profile_pic_url: '',
    interfaceLang: lang, activeModule: 'library', last_cached: null, appVersion: 'dev',
    path: url.pathname + url.search, route: 'dev', libraryNext: true,
    chatbot_user_token: null, chatbot_api_base_url: process.env.CHATBOT_API_BASE_URL || 'https://chat-dev.sefaria.org/api', chatbot_origin: 'library-next',
  };
  const bundleTag = bundle
    ? `<script defer src="/static/bundles/client-library-next/${bundle}"></script>`
    : `<script>document.addEventListener('DOMContentLoaded',function(){document.getElementById('library-next-root').innerHTML='<p style="padding:2rem;font-family:sans-serif">No bundle found. Run <code>npm run build-library-next</code> and reload.</p>';});</script>`;
  return `<!DOCTYPE html>
<html lang="${he ? 'he' : 'en'}" dir="${he ? 'rtl' : 'ltr'}">
<head>
    <meta charset="utf-8"/>
    <title>Sefaria Library (dev)</title>
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#FFFFFF">
    <link rel="icon" type="image/svg+xml" href="/static/icons/library/favicon.svg">
    <link rel="preload" href="/static/fonts/Taamey-Frank/TaameyFrankCLM-Medium.ttf" as="font" type="font/ttf" crossorigin>
    ${cdn ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://use.typekit.net/aeg8div.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Heebo:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap">` : '<!-- external fonts off; add ?cdn=1 -->'}
    <link rel="stylesheet" href="/static/css/color-palette.css">
    <script defer src="/vendor/react.js"></script>
    <script defer src="/vendor/react-dom.js"></script>
    <script defer src="/vendor/jquery.js"></script>
    <script defer src="/data.js"></script>
    ${bundleTag}
</head>
<body class="ln-body interface-${lang}" data-active-module="library" data-route="dev">
    <div id="library-next-root">
      <div class="ln-skeleton">
        <header class="ln-skeleton-header"><span class="ln-skeleton-logo"></span></header>
        <main class="ln-skeleton-main" aria-busy="true">
          <span class="ln-skeleton-line"></span>
          <span class="ln-skeleton-line"></span>
          <span class="ln-skeleton-line short"></span>
          <noscript>Sefaria Library needs JavaScript. / ספריית ספריא דורשת JavaScript.</noscript>
        </main>
      </div>
    </div>
    <style>
      .ln-skeleton{min-height:100vh;background:#fff;font-family:Roboto,Heebo,sans-serif}
      .ln-skeleton-header{height:56px;border-bottom:1px solid #EDEDEC;display:flex;align-items:center;padding-inline:16px}
      .ln-skeleton-logo{width:96px;height:22px;border-radius:4px;background:#e6e6e6}
      .ln-skeleton-main{max-width:720px;margin:48px auto;padding-inline:16px;display:grid;gap:14px}
      .ln-skeleton-line{display:block;height:14px;border-radius:4px;background:#efefef}
      .ln-skeleton-line.short{width:60%}
    </style>
    <script id="library-next-props" type="application/json">${escapeJson(props)}</script>
    <script>
      var DJANGO_VARS = {
        props: JSON.parse(document.getElementById("library-next-props").textContent),
        sentryDSN: null,
        inReaderApp: false,
        libraryNext: true,
        devHarness: true
      };
    </script>
</body>
</html>
`;
}

// ---- upstream proxy ------------------------------------------------------------------------

/** Open a TLS socket to `host:443`, through the HTTPS_PROXY CONNECT tunnel when one is set. */
function connectUpstream(host) {
  return new Promise((resolve, reject) => {
    const wrap = (socket) => {
      const secure = tls.connect({ socket, servername: host, ca: CA }, () => resolve(secure));
      secure.on('error', reject);
    };
    if (!PROXY) {
      const socket = tls.connect({ host, port: 443, servername: host, ca: CA }, () => resolve(socket));
      socket.on('error', reject);
      return;
    }
    const proxy = new URL(PROXY);
    const req = http.request({
      host: proxy.hostname, port: proxy.port || 80, method: 'CONNECT', path: `${host}:443`,
      headers: { Host: `${host}:443`, ...(proxy.username ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64') } : {}) },
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error(`proxy CONNECT ${host}: ${res.statusCode}`)); return; }
      wrap(socket);
    });
    req.on('error', reject);
    req.end();
  });
}

const dataCache = new Map();  // /data*.js bodies for the life of the process

async function proxyUpstream(req, res, url) {
  const cacheable = req.method === 'GET' && url.pathname.startsWith('/data');
  if (cacheable && dataCache.has(url.pathname)) {
    const hit = dataCache.get(url.pathname);
    res.writeHead(200, hit.headers);
    res.end(hit.body);
    return;
  }
  let socket;
  try {
    socket = await connectUpstream(UPSTREAM.hostname);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`upstream connect failed: ${e.message}\n`);
    return;
  }
  const headers = { ...req.headers, host: UPSTREAM.host, 'accept-encoding': 'identity' };
  delete headers.cookie;          // anonymous upstream
  delete headers.connection;
  const upstreamReq = https.request({
    host: UPSTREAM.hostname, port: 443, method: req.method, path: url.pathname + url.search, headers,
    createConnection: () => socket,
  }, (upstreamRes) => {
    const outHeaders = { ...upstreamRes.headers };
    delete outHeaders['set-cookie'];
    delete outHeaders['content-security-policy'];
    if (cacheable && upstreamRes.statusCode === 200) {
      const chunks = [];
      upstreamRes.on('data', c => chunks.push(c));
      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks);
        const cachedHeaders = { 'content-type': outHeaders['content-type'] || 'text/javascript', 'cache-control': 'no-cache', 'x-dev-cache': 'hit' };
        dataCache.set(url.pathname, { headers: cachedHeaders, body });
        res.writeHead(200, { ...cachedHeaders, 'x-dev-cache': 'miss' });
        res.end(body);
      });
      return;
    }
    res.writeHead(upstreamRes.statusCode, outHeaders);
    upstreamRes.pipe(res);
  });
  upstreamReq.on('error', (e) => {
    if (!res.headersSent) { res.writeHead(502, { 'content-type': 'text/plain' }); }
    res.end(`upstream error: ${e.message}\n`);
  });
  req.pipe(upstreamReq);
}

// ---- local files --------------------------------------------------------------------------

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function localStatic(url) {
  const rel = decodeURIComponent(url.pathname.replace(/^\/static\//, ''));
  const file = path.join(ROOT, 'static', rel);
  if (!file.startsWith(path.join(ROOT, 'static'))) { return null; }
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

// ---- server -------------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (VENDOR[p]) {
    const file = require.resolve(VENDOR[p], { paths: [ROOT] });
    return sendFile(res, file);
  }
  if (p.startsWith('/static/')) {
    const file = localStatic(url);
    if (file) { return sendFile(res, file); }
    return proxyUpstream(req, res, url);
  }
  if (PROXIED_PREFIXES.some(prefix => p.startsWith(prefix))) {
    return proxyUpstream(req, res, url);
  }
  const iface = /^\/interface\/(hebrew|english)\/?$/.exec(p);
  if (iface) {
    const next = url.searchParams.get('next') || '/';
    res.writeHead(302, { location: next.startsWith('/') ? next : '/', 'set-cookie': `interfaceLang=${iface[1]}; Path=/; Max-Age=31536000; SameSite=Lax` });
    return res.end();
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain' });
    return res.end('dev harness: only GET pages; POST goes to /api/* (proxied)\n');
  }
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
  const lang = url.searchParams.get('lang');
  if (lang === 'he' || lang === 'en') { headers['set-cookie'] = `interfaceLang=${lang === 'he' ? 'hebrew' : 'english'}; Path=/; Max-Age=31536000; SameSite=Lax`; }
  res.writeHead(200, headers);
  res.end(shellHtml(req, url, bundleFile()));
});

if (require.main === module) {
  server.listen(PORT, () => {
    const bundle = bundleFile();
    console.log(`Library Next dev harness  http://localhost:${PORT}`);
    console.log(`  upstream ${UPSTREAM.origin}${PROXY ? `  via ${PROXY}` : ''}${CA_BUNDLE ? `  ca ${CA_BUNDLE}` : ''}`);
    console.log(`  bundle   ${bundle || 'NONE (run npm run build-library-next)'}`);
  });
}

module.exports = { server, shellHtml, bundleFile, connectUpstream };
