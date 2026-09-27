#!/usr/bin/env node
/*
 * Dark-mode screenshot harness.
 *
 * Renders live www.sefaria.org HTML with THIS branch's CSS, client bundle and
 * static assets, then screenshots each page per theme x viewport. A second
 * mode pixel-diffs two earlier runs.
 *
 *   node scripts/darkmode/screenshots.js --out /tmp/shots-after
 *   node scripts/darkmode/screenshots.js --compare /tmp/shots-before /tmp/shots-after --out /tmp/shots-diff
 *
 * Why live HTML: a local Django + Mongo stack is not available in the agent
 * containers, but www.sefaria.org is. Every request is fetched by Node (which
 * trusts NODE_EXTRA_CA_CERTS and honours HTTPS_PROXY when NODE_USE_ENV_PROXY=1)
 * and fulfilled into Chromium through page.route, so Chromium never makes a
 * network connection of its own and TLS verification is never disabled.
 *
 * What the harness changes in the fetched HTML (per run):
 *   - <html data-theme="light|dark"> (plus a `theme` cookie so the head script
 *     resolves the same value);
 *   - <meta name="theme-color"> set to the dark colour on dark runs;
 *   - the branch's templates/elements/theme_head.html, when it exists, right
 *     after the theme-color meta and before the first stylesheet or script;
 *   - <link>s for theme-tokens.css (after color-palette.css) and
 *     theme-dark-overrides.css (after s2.css) when those files exist in
 *     --css-dir and the HTML does not already reference them;
 *   - DJANGO_VARS.props.theme (and interfaceLang for Hebrew runs);
 *   - by default (--render client) the production SSR markup inside #s2 is
 *     dropped so the branch bundle renders the app itself. Production SSR
 *     comes from production JSX, so hydrating it with branch JSX would mix
 *     two versions of the markup.
 *
 * No dependencies beyond Playwright (already in the repo). See README.md.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Re-exec with NODE_USE_ENV_PROXY=1 when a proxy is configured, so Node's
// fetch goes through it. Must happen before anything uses fetch.
// ---------------------------------------------------------------------------
const PROXY_SET = !!(process.env.HTTPS_PROXY || process.env.https_proxy);
if (require.main === module && PROXY_SET && process.env.NODE_USE_ENV_PROXY !== '1' && !process.env.__DARKMODE_REEXEC) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', __DARKMODE_REEXEC: '1' },
  });
  process.exit(r.status === null ? 1 : r.status);
}
// Node prints an "EnvHttpProxyAgent is experimental" warning once; hide just that one.
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.code !== 'UNDICI-EHPA') console.warn(String(w)); });

const { chromium } = require('playwright');

const REPO_DEFAULT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default page list. `ready` is a selector that proves the page's own content
 * (not just the header) rendered; a shot whose `ready` selector never appears
 * is still written but flagged `contentReady: false` in manifest.json.
 * A `he:` prefix renders the page with the Hebrew interface.
 */
const DEFAULT_PAGES = [
  { path: '/texts', ready: '.navBlock' },
  { path: '/Genesis.1', ready: '.segment' },
  { path: '/Genesis.1?lang=bi', ready: '.segment' },
  { path: '/Genesis.1.1?with=all', ready: '.categoryFilterGroup', label: 'Genesis.1.1_connections' },
  { path: '/topics', ready: '.topic-salad-item' },
  // /topics/shabbat, not /topics/moses: the agent proxy rejects any path containing ";"
  // ("matrix parameter separator"), and Moses' /api/bulktext request has one.
  { path: '/topics/shabbat', ready: '.topicPanel .story' },
  // Results never load from the agent containers (the proxy allows GET only and search
  // is a POST), so this captures the search chrome and the no-results state.
  { path: '/search?q=moses', ready: '.searchContent .searchTopMatter' },
  { path: '/calendars', ready: '.calendarListing' },
  { path: '/about', ready: '#staticContentWrapper .aboutHeader' },
  { path: '/login', ready: '.sefaria-auth-card' },
  { path: '/register', ready: '.sefaria-auth-card' },
  { path: 'he:/texts', ready: '.navBlock' },
];

const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false },
  mobile: {
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  },
};

// Third parties that are irrelevant to rendering (or blocked from the agent
// containers) are aborted so they cannot stall a page or make shots flaky.
const ABORT_RE = /(googletagmanager|google-analytics|hotjar|visualwebsiteoptimizer|ubembed|simpleanalytics|doubleclick|accounts\.google\.com|appleid\.cdn-apple\.com|recaptcha|www\.google\.com|sentry|use\.typekit\.net|cloudflare-static\/email-decode|facebook|twitter|linkedin|bing\.com|clarity\.ms)/;
const GCHARTS_RE = /www\.gstatic\.com\/charts\/loader\.js/;
// TextsPage's <Dedication> crashes the whole app when google.visualization is missing.
const GCHARTS_STUB = 'window.google=window.google||{};google.charts={load:function(){},setOnLoadCallback:function(){}};google.visualization={Query:function(){this.send=function(){};this.setQuery=function(){};}};';
const CDN_MAP = [
  // The dev client bundle needs the React *development* UMD builds; the
  // production ones throw `getStackAddendum`.
  [/unpkg\.com\/react@16\/umd\/react\./, 'node_modules/react/umd/react.development.js'],
  [/unpkg\.com\/react-dom@16\/umd\/react-dom\./, 'node_modules/react-dom/umd/react-dom.development.js'],
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery\/2\.2\.4\//, 'node_modules/jquery/dist/jquery.min.js'],
  [/cdnjs\.cloudflare\.com\/ajax\/libs\/jqueryui\/1\.12\.1\//, 'static/js/lib/jquery-ui.js'],
];
const CDN_RE = /(unpkg\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)/;

const FREEZE_CSS = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage:
  node scripts/darkmode/screenshots.js [options]
  node scripts/darkmode/screenshots.js --compare <dirA> <dirB> [--out <diffDir>] [--threshold 0.1] [--fail-on-diff]

Capture options:
  --out <dir>              output directory (default: ./darkmode-screenshots)
  --repo <dir>             branch checkout to serve assets from (default: this script's repo)
  --css-dir <dir>          CSS served for /static/css/* (default: <repo>/static/css)
  --bundle-dir <dir>       dir holding client-*.js from \`npm run build-client\` (default: <repo>/static/bundles/client)
  --pages <list>           comma-separated paths; prefix "he:" for Hebrew interface (default: built-in list)
  --themes <list>          light,dark (default: light,dark)
  --viewports <list>       desktop,mobile (default: desktop,mobile)
  --mobile-menu-open       on mobile, also capture each page with the hamburger menu open
  --hebrew                 also capture every page with the Hebrew interface
  --base-url <url>         live site to fetch HTML from (default: https://www.sefaria.org)
  --render client|hydrate  client: branch bundle renders from scratch (default); hydrate: keep prod SSR
  --no-local-static        only serve CSS + bundle locally (default also serves any existing <repo>/static/* file)
  --full-page              full-page screenshots (default: viewport only)
  --concurrency <n>        parallel browser contexts (default: 4)
  --settle <ms>            extra wait after the page is ready (default: 1500)

Env:
  DARKMODE_CHROMIUM_PATH   Chromium executable (default: Playwright's own). In the agent
                           containers: /opt/pw-browsers/chromium-1194/chrome-linux/chrome
`;

function parseArgs(argv) {
  const opts = {
    repo: REPO_DEFAULT, cssDir: null, bundleDir: null, out: null, pages: null,
    themes: ['light', 'dark'], viewports: ['desktop', 'mobile'], mobileMenuOpen: false,
    hebrew: false, baseUrl: 'https://www.sefaria.org', render: 'client', localStatic: true,
    fullPage: false, concurrency: 4, settle: 1500, compare: null, threshold: 0.1, failOnDiff: false,
  };
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--help': case '-h': console.log(USAGE); process.exit(0); break;
      case '--repo': opts.repo = path.resolve(next()); break;
      case '--css-dir': opts.cssDir = path.resolve(next()); break;
      case '--bundle-dir': opts.bundleDir = path.resolve(next()); break;
      case '--out': opts.out = path.resolve(next()); break;
      case '--pages': opts.pages = list(next()); break;
      case '--themes': opts.themes = list(next()); break;
      case '--viewports': opts.viewports = list(next()); break;
      case '--mobile-menu-open': opts.mobileMenuOpen = true; break;
      case '--hebrew': opts.hebrew = true; break;
      case '--base-url': opts.baseUrl = next().replace(/\/$/, ''); break;
      case '--render': opts.render = next(); break;
      case '--no-local-static': opts.localStatic = false; break;
      case '--full-page': opts.fullPage = true; break;
      case '--concurrency': opts.concurrency = Math.max(1, parseInt(next(), 10) || 1); break;
      case '--settle': opts.settle = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--compare': opts.compare = [path.resolve(next()), path.resolve(next())]; break;
      case '--threshold': opts.threshold = parseFloat(next()); break;
      case '--fail-on-diff': opts.failOnDiff = true; break;
      default: throw new Error(`Unknown argument: ${a}\n\n${USAGE}`);
    }
  }
  for (const th of opts.themes) if (!['light', 'dark'].includes(th)) throw new Error(`Unknown theme "${th}"`);
  for (const vp of opts.viewports) if (!VIEWPORTS[vp]) throw new Error(`Unknown viewport "${vp}"`);
  if (!['client', 'hydrate'].includes(opts.render)) throw new Error('--render must be client or hydrate');
  opts.cssDir = opts.cssDir || path.join(opts.repo, 'static', 'css');
  opts.bundleDir = opts.bundleDir || path.join(opts.repo, 'static', 'bundles', 'client');
  opts.out = opts.out || path.resolve(opts.compare ? 'darkmode-screenshots-diff' : 'darkmode-screenshots');
  return opts;
}

function launchOptions() {
  const exe = process.env.DARKMODE_CHROMIUM_PATH;
  return exe ? { executablePath: exe } : {};
}

// ---------------------------------------------------------------------------
// Page specs
// ---------------------------------------------------------------------------

function slugify(s) {
  return s.replace(/^\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'home';
}

function buildPageSpecs(opts) {
  const known = new Map(DEFAULT_PAGES.map((p) => [p.path, p]));
  const raw = opts.pages ? opts.pages.map((p) => known.get(p) || { path: p }) : DEFAULT_PAGES;
  const specs = [];
  for (const p of raw) {
    const hebrew = p.path.startsWith('he:');
    const pagePath = hebrew ? p.path.slice(3) : p.path;
    const base = p.label || slugify(pagePath);
    specs.push({ ...p, pagePath, hebrew, slug: hebrew ? `he_${base}` : base });
    if (opts.hebrew && !hebrew) {
      specs.push({ ...p, pagePath, hebrew: true, slug: `he_${base}` });
    }
  }
  // de-duplicate (e.g. --hebrew plus an explicit he: entry)
  const seen = new Set();
  return specs.filter((s) => (seen.has(s.slug) ? false : seen.add(s.slug)));
}

// ---------------------------------------------------------------------------
// Branch assets
// ---------------------------------------------------------------------------

function readThemeHead(repo) {
  const file = path.join(repo, 'templates', 'elements', 'theme_head.html');
  if (!fs.existsSync(file)) return null;
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(/\{%\s*comment\s*%\}[\s\S]*?\{%\s*endcomment\s*%\}/g, '').replace(/\{#[\s\S]*?#\}/g, '');
  if (/\{\{|\{%/.test(s)) {
    console.warn(`warning: ${file} still contains Django template tags after stripping comments; they are injected verbatim.`);
  }
  return s.trim();
}

function findBundle(bundleDir) {
  if (!fs.existsSync(bundleDir)) return null;
  const files = fs.readdirSync(bundleDir).filter((f) => /^client-.*\.js$/.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(bundleDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(bundleDir, files[0].f) : null;
}

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.map': 'application/json',
};

// ---------------------------------------------------------------------------
// HTML transform
// ---------------------------------------------------------------------------

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Insert `snippet` after the first <link> whose href references `/static/css/<file>`
 * (screen, not print). Returns [html, inserted?].
 */
function insertAfterStylesheet(html, file, snippet) {
  const re = new RegExp(`<link\\b[^>]*href="[^"]*/static/css/${escapeRe(file)}(?:\\?[^"]*)?"[^>]*>`, 'g');
  let m;
  while ((m = re.exec(html))) {
    if (/media="print"/.test(m[0])) continue;
    const at = m.index + m[0].length;
    return [html.slice(0, at) + '\n' + snippet + html.slice(at), true];
  }
  return [html, false];
}

function transformHtml(html, ctx) {
  const { theme, hebrew, origin, themeHead, cssFiles, render } = ctx;
  const report = { themeHead: false, themeTokens: false, darkOverrides: false, propsPatched: false, ssrDropped: false };

  // 1. <html data-theme=...> (replace an existing one; prod may ship it later)
  html = html.replace(/<html\b([^>]*)>/i, (all, attrs) => {
    let a = attrs.replace(/\sdata-theme="[^"]*"/g, '');
    if (hebrew) a = a.replace(/\slang="[^"]*"/, ' lang="he"');
    return `<html${a} data-theme="${theme}">`;
  });

  // 2. <meta name="theme-color">: dark runs get the dark header colour, as base.html renders it.
  if (theme === 'dark') {
    html = html.replace(/(<meta\s+name="theme-color"\s+content=")[^"]*(")/i, '$1#181818$2');
  }

  // 3. theme_head.html where base.html includes it: after the theme-color meta (the script
  //    updates that meta), and in any case before the first stylesheet or external script.
  if (themeHead) {
    const firstBlocking = Math.min(...[/<link\b[^>]*rel="stylesheet"/i, /<script\b[^>]*\bsrc=/i]
      .map((re) => { const i = html.search(re); return i === -1 ? Infinity : i; }));
    const anchor = /<meta\s+name="theme-color"[^>]*>/i.exec(html) || /<meta\s+name="viewport"[^>]*>/i.exec(html);
    let at = -1;
    if (anchor && anchor.index < firstBlocking) at = anchor.index + anchor[0].length;
    else if (firstBlocking !== Infinity) at = firstBlocking;
    else { const h = /<head\b[^>]*>/i.exec(html); if (h) at = h.index + h[0].length; }
    if (at !== -1) {
      html = html.slice(0, at) + '\n' + themeHead + '\n' + html.slice(at);
      report.themeHead = true;
    }
  }

  // 4. new stylesheets, only when the branch has them and prod HTML lacks them.
  const link = (f) => `<link rel="stylesheet" href="${origin}/static/css/${f}?darkmode-harness">`;
  if (cssFiles.themeTokens && !html.includes('/static/css/theme-tokens.css')) {
    [html, report.themeTokens] = insertAfterStylesheet(html, 'color-palette.css', link('theme-tokens.css'));
  }
  if (cssFiles.darkOverrides && !html.includes('/static/css/theme-dark-overrides.css')) {
    [html, report.darkOverrides] = insertAfterStylesheet(html, 's2.css', link('theme-dark-overrides.css'));
  }

  // 5. Hebrew interface: body class (CSS keys off it) + props (JS keys off it).
  if (hebrew) {
    html = html.replace(/(<body\b[^>]*class=")interface-english/, '$1interface-hebrew');
    html = html.replace(/(<div id="content" class=")interface-english/, '$1interface-hebrew');
  }

  // 6. Patch props and (optionally) drop prod SSR, right before the client bundle runs.
  const patch = `<script>(function(){try{var P=window.DJANGO_VARS&&DJANGO_VARS.props;if(P){P.theme=${JSON.stringify(theme)};${hebrew ? 'P.interfaceLang="hebrew";' : ''}}` +
    (render === 'client' ? `var s=document.getElementById('s2');if(s){s.innerHTML='<div id="appLoading"></div>';}` : '') +
    `}catch(e){console.error('darkmode-harness patch failed',e)}})();</script>`;
  const bundleTag = /<script\b[^>]*src="[^"]*\/static\/bundles\/client\/client-[^"]*\.js"[^>]*><\/script>/i.exec(html);
  if (bundleTag) {
    html = html.slice(0, bundleTag.index) + patch + '\n' + html.slice(bundleTag.index);
    report.propsPatched = true;
    report.ssrDropped = render === 'client';
  }
  return { html, report };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

async function nodeFetch(route, req) {
  const headers = { ...(await req.allHeaders()) };
  for (const h of Object.keys(headers)) {
    if (h.startsWith(':') || ['accept-encoding', 'host', 'connection', 'content-length'].includes(h)) delete headers[h];
  }
  const r = await fetch(req.url(), {
    method: req.method(),
    headers,
    body: ['GET', 'HEAD'].includes(req.method()) ? undefined : (req.postDataBuffer() || undefined),
    redirect: 'manual',
    signal: AbortSignal.timeout(45000),
  });
  const body = Buffer.from(await r.arrayBuffer());
  const out = {};
  r.headers.forEach((v, k) => {
    if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v;
  });
  return { status: r.status, headers: out, body };
}

async function installRoutes(context, opts, run, stats) {
  const origin = new URL(opts.baseUrl).origin;
  const originRe = escapeRe(origin);
  const staticRe = new RegExp(`^${originRe}/static/([^?#]+)`);
  const bundleRe = new RegExp(`^${originRe}/static/bundles/client/client-[^/]+\\.js(\\?.*)?$`);

  // A predicate, not the glob '**/*': that glob does not match a bare origin URL ending in
  // '/', which Chromium would then fetch itself (and fail TLS against the proxy CA).
  await context.route(() => true, async (route) => {
    const req = route.request();
    const url = req.url();
    try {
      if (!/^https?:/.test(url)) return route.continue();
      if (ABORT_RE.test(url)) return route.abort();
      if (GCHARTS_RE.test(url)) return route.fulfill({ contentType: 'application/javascript', body: GCHARTS_STUB });
      if (/\/api\/strapi\/graphql-cache/.test(url)) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { modals: { data: [] }, banners: { data: [] }, sidebarAds: { data: [] } } }) });
      }
      if (CDN_RE.test(url)) {
        const hit = CDN_MAP.find(([re]) => re.test(url));
        if (hit) return route.fulfill({ path: path.join(opts.repo, hit[1]), contentType: 'application/javascript' });
        return route.abort();
      }
      if (bundleRe.test(url)) {
        if (run.bundle) { stats.local++; return route.fulfill({ path: run.bundle, contentType: CONTENT_TYPES['.js'] }); }
      } else {
        const sm = staticRe.exec(url);
        if (sm) {
          const rel = decodeURIComponent(sm[1]);
          const local = rel.startsWith('css/')
            ? path.join(opts.cssDir, rel.slice(4))
            : (opts.localStatic ? path.join(opts.repo, 'static', rel) : null);
          if (local && !rel.includes('..') && fs.existsSync(local) && fs.statSync(local).isFile()) {
            stats.local++;
            return route.fulfill({ path: local, contentType: CONTENT_TYPES[path.extname(local).toLowerCase()] || 'application/octet-stream' });
          }
          if (rel.startsWith('css/')) stats.missingCss.add(rel);
        }
      }
      const res = await nodeFetch(route, req);
      stats.remote++;
      if (req.isNavigationRequest() && res.status >= 300 && res.status < 400 && res.headers.location) {
        // Chromium follows a redirect fulfilled into a navigation over the network itself,
        // bypassing page.route (and failing TLS). Hand it a same-origin refresh instead,
        // which is a fresh, routed navigation.
        const to = new URL(res.headers.location, url).href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><meta http-equiv="refresh" content="0;url=${to}">` });
      }
      const isDoc = req.resourceType() === 'document' && url.startsWith(origin) && /text\/html/.test(res.headers['content-type'] || '');
      if (isDoc && res.status === 200) {
        const { html, report } = transformHtml(res.body.toString('utf8'), {
          theme: run.theme, hebrew: run.hebrew, origin, themeHead: run.themeHead, cssFiles: run.cssFiles, render: opts.render,
        });
        stats.inject = report;
        return route.fulfill({ status: 200, headers: res.headers, body: html });
      }
      return route.fulfill(res);
    } catch (e) {
      stats.failed.push(`${url.slice(0, 140)} (${e.cause?.code || e.name || e.message})`);
      return route.abort().catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/** Follow redirects Node-side so page.goto lands on the final URL in one navigation. */
async function resolveRedirects(url, cookieHeader) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const r = await fetch(current, { method: 'GET', redirect: 'manual', headers: cookieHeader ? { cookie: cookieHeader } : {}, signal: AbortSignal.timeout(30000) });
    await r.arrayBuffer().catch(() => {});
    const loc = r.headers.get('location');
    if (r.status < 300 || r.status >= 400 || !loc) return current;
    current = new URL(loc, current).href;
  }
  return current;
}

async function waitForQuiet(page, inflight, maxMs) {
  const start = Date.now();
  let quietSince = inflight.size === 0 ? Date.now() : null;
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(100);
    if (inflight.size === 0) {
      quietSince = quietSince || Date.now();
      if (Date.now() - quietSince >= 750) return true;
    } else {
      quietSince = null;
    }
  }
  return false;
}

async function capture(browser, opts, spec, viewportName, theme, shared) {
  const vp = VIEWPORTS[viewportName];
  const host = new URL(opts.baseUrl).hostname;
  const cookieDomain = '.' + host.replace(/^www\./, '');
  const context = await browser.newContext({ ...vp, colorScheme: 'light', locale: spec.hebrew ? 'he-IL' : 'en-US' });
  await context.addCookies([
    { name: 'theme', value: theme, domain: cookieDomain, path: '/' },
    { name: 'cookiesNotificationAccepted', value: '1', domain: cookieDomain, path: '/' },
  ]);
  // Same modal/banner suppression the e2e suite uses (utils.ts installOverlaySuppression).
  await context.addInitScript(() => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      if (typeof k === 'string' && (k.startsWith('modal_') || k.startsWith('banner_'))) return 'true';
      return orig.call(this, k);
    };
  });

  const run = { theme, hebrew: spec.hebrew, bundle: shared.bundle, themeHead: shared.themeHead, cssFiles: shared.cssFiles };
  const stats = { local: 0, remote: 0, failed: [], missingCss: new Set(), inject: null };
  await installRoutes(context, opts, run, stats);

  const page = await context.newPage();
  const errors = [];
  let warnings = 0;
  page.on('pageerror', (e) => errors.push(`pageerror: ${String((e && (e.stack || e.message)) || e).split('\n')[0].slice(0, 300)}`));
  const httpErrors = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && httpErrors.length < 20) httpErrors.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error' || /Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(m.text())) return;
    // React development-build warnings (prop types, hydration, keys) are noise here.
    if (/^Warning: /.test(m.text())) warnings++; else errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  const inflight = new Set();
  page.on('request', (r) => inflight.add(r));
  page.on('requestfinished', (r) => inflight.delete(r));
  page.on('requestfailed', (r) => inflight.delete(r));

  const requested = opts.baseUrl + spec.pagePath;
  const url = await resolveRedirects(requested, `theme=${theme}; cookiesNotificationAccepted=1`).catch(() => requested);
  const base = `${spec.slug}__${viewportName}__${theme}`;
  const results = [];
  const t0 = Date.now();
  let appReady = false; let contentReady = null; let status = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    status = resp ? resp.status() : null;
    await page.waitForFunction(() => !!(window.Sefaria && document.querySelector('#s2 .header, #s2 .readerApp')), null, { timeout: 45000 });
    appReady = true;
    if (spec.ready) {
      contentReady = await page.waitForSelector(spec.ready, { state: 'attached', timeout: 25000 }).then(() => true, () => false);
    }
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await waitForQuiet(page, inflight, 10000);
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.waitForTimeout(opts.settle);
  } catch (e) {
    errors.push(`load: ${String(e.message || e).split('\n')[0]}`);
  }

  const snapshot = async (suffix) => {
    const file = `${base}${suffix}.png`;
    const probe = await page.evaluate(() => ({
      dataTheme: document.documentElement.getAttribute('data-theme'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyClass: document.body.className,
      title: document.title,
    })).catch(() => ({}));
    await page.screenshot({ path: path.join(opts.out, file), fullPage: opts.fullPage, animations: 'disabled' });
    results.push({
      file, page: spec.path || spec.pagePath, url, viewport: viewportName, theme, hebrew: spec.hebrew,
      menuOpen: suffix === '__menu', status, appReady, contentReady, ...probe,
    });
  };

  await snapshot('');
  let menuSkipped = null;
  if (opts.mobileMenuOpen && viewportName === 'mobile' && appReady) {
    try {
      // Header hamburger, or on the mobile reader (header replaced by ReaderControls) its
      // own menu button, which opens the same MobileNavMenu.
      const menuButton = page.locator('button.menuButton:visible, .readerNavMenuMenuButton:visible').first();
      if (!(await menuButton.count())) throw Object.assign(new Error('no hamburger on this page'), { skip: true });
      await menuButton.tap({ timeout: 10000 });
      await page.waitForSelector('.mobileNavMenu:not(.closed)', { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(500);
      await snapshot('__menu');
    } catch (e) {
      if (e.skip) menuSkipped = e.message;
      else errors.push(`menu: ${String(e.message || e).split('\n')[0]}`);
    }
  }
  await context.close();
  const extra = {
    ms: Date.now() - t0, servedLocally: stats.local, fetchedRemote: stats.remote,
    injected: stats.inject, missingCss: [...stats.missingCss], failedRequests: stats.failed.slice(0, 20), errors, httpErrors, reactWarnings: warnings, menuSkipped,
  };
  return results.map((r) => ({ ...r, ...extra }));
}

async function runCapture(opts) {
  fs.mkdirSync(opts.out, { recursive: true });
  const bundle = findBundle(opts.bundleDir);
  if (!bundle) {
    console.warn(`warning: no client-*.js in ${opts.bundleDir}; production's bundle will be used (run \`npm run build-client\`).`);
  }
  const shared = {
    bundle,
    themeHead: readThemeHead(opts.repo),
    cssFiles: {
      themeTokens: fs.existsSync(path.join(opts.cssDir, 'theme-tokens.css')),
      darkOverrides: fs.existsSync(path.join(opts.cssDir, 'theme-dark-overrides.css')),
    },
  };
  const specs = buildPageSpecs(opts);
  console.log(`repo       ${opts.repo}`);
  console.log(`css        ${opts.cssDir}${shared.cssFiles.themeTokens ? ' (+theme-tokens.css)' : ''}${shared.cssFiles.darkOverrides ? ' (+theme-dark-overrides.css)' : ''}`);
  console.log(`bundle     ${bundle || '(production)'}`);
  console.log(`theme_head ${shared.themeHead ? 'templates/elements/theme_head.html' : '(absent)'}`);
  console.log(`render     ${opts.render}`);
  console.log(`jobs       ${specs.length} pages x ${opts.viewports.length} viewports x ${opts.themes.length} themes -> ${opts.out}`);

  const jobs = [];
  for (const spec of specs) for (const vp of opts.viewports) for (const th of opts.themes) jobs.push([spec, vp, th]);

  const browser = await chromium.launch(launchOptions());
  const manifest = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [spec, vp, th] = jobs[next++];
      const rows = await capture(browser, opts, spec, vp, th, shared).catch((e) => [{
        file: null, page: spec.path, viewport: vp, theme: th, hebrew: spec.hebrew, errors: [`fatal: ${e.message}`],
      }]);
      for (const r of rows) {
        manifest.push(r);
        const flag = !r.appReady ? 'FAIL' : r.contentReady === false ? 'WARN' : (r.errors && r.errors.length) ? 'ERR ' : 'ok  ';
        console.log(`${flag} ${String(r.file || `${spec.slug}__${vp}__${th}`).padEnd(52)} theme=${r.dataTheme || '-'} bg=${r.bodyBg || '-'} ${r.ms ? r.ms + 'ms' : ''}${r.errors && r.errors.length ? '  ' + r.errors[0].slice(0, 120) : ''}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, jobs.length) }, worker));
  await browser.close();

  manifest.sort((a, b) => String(a.file).localeCompare(String(b.file)));
  const summary = {
    generatedAt: new Date().toISOString(), baseUrl: opts.baseUrl, repo: opts.repo, cssDir: opts.cssDir,
    bundle, themeHead: !!shared.themeHead, cssFiles: shared.cssFiles, render: opts.render,
    shots: manifest.length,
    failed: manifest.filter((r) => !r.appReady).length,
    contentNotReady: manifest.filter((r) => r.contentReady === false).length,
    withErrors: manifest.filter((r) => r.errors && r.errors.length).length,
    results: manifest,
  };
  fs.writeFileSync(path.join(opts.out, 'manifest.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.shots} shots, ${summary.failed} failed to render, ${summary.contentNotReady} without their content selector, ${summary.withErrors} with page errors. manifest: ${path.join(opts.out, 'manifest.json')}`);
  return summary.failed ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

function listPngs(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.png')) out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Pixel-diff in a blank Chromium page with canvas (no pngjs/pixelmatch in the
 * repo). A pixel differs when any RGBA channel differs by more than
 * threshold*255. Diff image: differing pixels red, the rest a faded greyscale
 * of image A. A size mismatch counts every non-overlapping pixel as different.
 */
async function runCompare(opts) {
  const [dirA, dirB] = opts.compare;
  for (const d of [dirA, dirB]) if (!fs.existsSync(d)) throw new Error(`No such directory: ${d}`);
  fs.mkdirSync(opts.out, { recursive: true });
  const a = new Set(listPngs(dirA));
  const b = new Set(listPngs(dirB));
  const common = [...a].filter((f) => b.has(f));
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage();
  const tol = Math.round(Math.max(0, Math.min(1, opts.threshold)) * 255);
  const files = [];
  for (const rel of common) {
    const res = await page.evaluate(async ({ a64, b64, tol }) => {
      const load = async (b64) => {
        const bin = atob(b64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return createImageBitmap(new Blob([u], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      };
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const W = Math.max(ia.width, ib.width); const H = Math.max(ia.height, ib.height);
      const px = (img) => {
        const c = new OffscreenCanvas(W, H); const g = c.getContext('2d', { colorSpace: 'srgb' });
        g.drawImage(img, 0, 0); return g.getImageData(0, 0, W, H).data;
      };
      const da = px(ia); const db = px(ib);
      const out = new OffscreenCanvas(W, H); const og = out.getContext('2d');
      const od = og.createImageData(W, H); const o = od.data;
      let diff = 0; let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const inA = x < ia.width && y < ia.height; const inB = x < ib.width && y < ib.height;
          const d = !(inA && inB) ||
            Math.abs(da[i] - db[i]) > tol || Math.abs(da[i + 1] - db[i + 1]) > tol ||
            Math.abs(da[i + 2] - db[i + 2]) > tol || Math.abs(da[i + 3] - db[i + 3]) > tol;
          if (d) {
            diff++; o[i] = 255; o[i + 1] = 0; o[i + 2] = 0; o[i + 3] = 255;
            if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
          } else {
            const l = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2];
            const v = 255 - (255 - l) * 0.25; o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255;
          }
        }
      }
      og.putImageData(od, 0, 0);
      let png = null;
      if (diff) {
        const blob = await out.convertToBlob({ type: 'image/png' });
        const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        png = btoa(s);
      }
      return {
        sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], diffPixels: diff, totalPixels: W * H,
        bbox: diff ? [minX, minY, maxX, maxY] : null, png,
      };
    }, { a64: fs.readFileSync(path.join(dirA, rel)).toString('base64'), b64: fs.readFileSync(path.join(dirB, rel)).toString('base64'), tol });
    let diffImage = null;
    if (res.png) {
      diffImage = rel.replace(/\.png$/, '.diff.png');
      fs.mkdirSync(path.dirname(path.join(opts.out, diffImage)), { recursive: true });
      fs.writeFileSync(path.join(opts.out, diffImage), Buffer.from(res.png, 'base64'));
    }
    const ratio = res.diffPixels / res.totalPixels;
    files.push({ file: rel, sizeA: res.sizeA, sizeB: res.sizeB, diffPixels: res.diffPixels, totalPixels: res.totalPixels, ratio, bbox: res.bbox, diffImage });
    console.log(`${res.diffPixels ? 'DIFF' : 'same'} ${rel.padEnd(56)} ${res.diffPixels ? `${res.diffPixels}px (${(ratio * 100).toFixed(3)}%) bbox=${res.bbox.join(',')}` : ''}`);
  }
  await browser.close();
  const summary = {
    generatedAt: new Date().toISOString(), dirA, dirB, threshold: opts.threshold,
    compared: files.length, identical: files.filter((f) => !f.diffPixels).length,
    different: files.filter((f) => f.diffPixels).length,
    onlyInA: [...a].filter((f) => !b.has(f)), onlyInB: [...b].filter((f) => !a.has(f)),
    files,
  };
  fs.writeFileSync(path.join(opts.out, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.compared} compared: ${summary.identical} identical, ${summary.different} different; ${summary.onlyInA.length} only in A, ${summary.onlyInB.length} only in B. summary: ${path.join(opts.out, 'summary.json')}`);
  return opts.failOnDiff && (summary.different || summary.onlyInA.length || summary.onlyInB.length) ? 2 : 0;
}

// ---------------------------------------------------------------------------

if (require.main === module) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(64); }
  (opts.compare ? runCompare(opts) : runCapture(opts))
    .then((code) => process.exit(code))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { transformHtml, parseArgs, buildPageSpecs, installRoutes, readThemeHead, findBundle, launchOptions, VIEWPORTS, DEFAULT_PAGES };
