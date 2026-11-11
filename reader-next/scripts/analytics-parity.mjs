// Analytics parity harness (a launch check for each page type): the same scripted session on
// the legacy site (www.sefaria.org, read-only) and on the new reader, every analytics call captured in the page, then a diff of event
// names and parameters, step by step.
//
//   node scripts/analytics-parity.mjs [--legacy https://www.sefaria.org] [--next http://localhost:3290] [--json out.json] [--headed]
//
// What is captured (hooked by an init script before any page script runs): every dataLayer.push (gtag's commands arrive here as
// `arguments`, GTM's own as objects), every call of GTM's `ga` (the Universal Analytics shim the old Track and the new uaEvent use)
// and every sa_event (Simple Analytics). The hooks only record; the vendors still run, so the tags behave as on the live page.
//
// Nothing leaves the browser: every hit endpoint (GA4/UA collect on google-analytics.com, analytics.google.com, doubleclick, the
// Simple Analytics queue) is aborted, as are VWO, Hotjar, Unbounce, and every non-GET request except the search API (a read).
// The scripts themselves (gtm.js, gtag/js, analytics.js) load, so GTM's ga shim exists on both sides.
//
// Run the new reader as a production build (npm run build; PORT=… npm start): the dev server wraps the app in React's StrictMode,
// which runs every mount effect twice, so each mount-time event (select_content…) shows up twice.
// The new reader must run with the same tag IDs as the live page, or there is no gtag/GTM to compare: the harness reads them from the
// legacy page and prints the command, e.g.
//   PUBLIC_SITE_ORIGIN= GOOGLE_TAG_MANAGER_CODE=GTM-XXXX GOOGLE_GTAG=G-XXXX SIMPLE_ANALYTICS_HOSTNAME=sefaria.org APP_VERSION=<live's> PORT=3291 npm start
// (PUBLIC_SITE_ORIGIN empty: the site's links stay on the reader under test; a navigation to another origin is aborted and listed).
// Ignored in the diff: the `web_vitals` event (new-reader only, by design), GTM's own gtm.* bookkeeping and the volatile values (ids,
// timestamps, flow ids) listed in VOLATILE.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const LEGACY = arg("legacy", "https://www.sefaria.org");
const NEXT = arg("next", process.env.NEXT_ORIGIN || "http://localhost:3290");
const JSON_OUT = arg("json", null);
const HEADED = process.argv.includes("--headed");

const IGNORED_EVENTS = new Set(["web_vitals"]);
const VOLATILE = new Set(["flow_id", "search_id", "metric_id", "metric_value", "metric_rating", "debug_target", "gtm.uniqueEventId", "gtm.start", "custom_session_id", "sefaria_id", "&gtm", "&gcd", "&dma", "&tag_exp", "gtm.element", "gtm.elementClasses", "gtm.elementId", "gtm.elementTarget", "gtm.elementUrl", "gtm.triggers", "duration_ms", "time_to_first_result_ms", "elapsed_ms"]);

const BLOCK_HOSTS = /(^|\.)(hotjar\.(com|io)|visualwebsiteoptimizer\.com|unbounce\.com|ubembed\.com|facebook\.(com|net)|clarity\.ms|queue\.simpleanalyticscdn\.com|doubleclick\.net|googleadservices\.com)$/;
const isHit = (u) => /google-analytics\.com|analytics\.google\.com|googletagmanager\.com|google\.com/.test(u.hostname) && /collect|\/g\/|\/j\/|\/r\/|\/ccm\//.test(u.pathname) && !/\/(gtm|gtag\/js|analytics)\.js|\/gtag\/js/.test(u.pathname);

/** The init script: record before anything else runs. */
const HOOKS = () => {
  const send = (ch, a) => {
    try {
      const plain = JSON.parse(JSON.stringify(a, (_k, v) => (typeof v === "function" ? "[fn]" : typeof Element !== "undefined" && v instanceof Element ? "[element]" : v)));
      window.__parityPush?.({ ch, a: plain, path: location.pathname });
    } catch {
      window.__parityPush?.({ ch, a: [String(a)], path: location.pathname });
    }
  };
  // dataLayer: an array whose push records; GTM later wraps this push with its own and calls it (VERIFIED with scripts/probes/anl-probe.mjs)
  const dl = window.dataLayer || [];
  const arrayPush = dl.push.bind(dl);
  dl.push = function (...items) {
    for (const it of items) send("dl", it && typeof it === "object" && "length" in it && !Array.isArray(it) ? Array.from(it) : [it]);
    return arrayPush(...items);
  };
  window.dataLayer = dl;
  // gtag as base.html defines it (the page's own definition replaces this one; both push `arguments`)
  if (!window.gtag) window.gtag = function () { window.dataLayer.push(arguments); };
  // ga and sa_event: wrap whatever the vendor assigns
  const wrapGlobal = (name, ch) => {
    let inner;
    Object.defineProperty(window, name, {
      configurable: true,
      get() {
        return inner;
      },
      set(f) {
        if (typeof f !== "function") {
          inner = f;
          return;
        }
        const w = function (...a) {
          send(ch, a);
          return f.apply(this, a);
        };
        for (const k of Object.keys(f)) w[k] = f[k];
        w.getAll = (...x) => (f.getAll ? f.getAll(...x) : []);
        Object.defineProperty(w, "q", { get: () => f.q, set: (v) => {
            f.q = v;
          } });
        Object.defineProperty(w, "l", { get: () => f.l, set: (v) => {
            f.l = v;
          } });
        inner = w;
      },
    });
  };
  wrapGlobal("ga", "ga");
  wrapGlobal("sa_event", "sa");
};

/** The session, written once with a selector list per site (old markup / new markup). A step that finds nothing is reported. */
const STEPS = [
  { name: "open Genesis 1", run: (p, base) => p.goto(`${base}/Genesis.1`, { waitUntil: "domcontentloaded" }).then(() => p.waitForTimeout(4000)) },
  { name: "select a verse (opens the sidebar)", run: (p) => clickFirst(p, ['.segment[data-ref="Genesis 1:1"]', '[role="group"][data-ref="Genesis 1:1"]']) },
  { name: "open Commentary", run: (p) => clickFirst(p, [".connectionsPanel .categoryFilter[data-name='Commentary']", "text=/^Commentary/"]) },
  { name: "open Rashi", run: (p) => clickFirst(p, [".connectionsPanel .textFilter[data-name='Rashi']", ".connectionsPanel >> text=/^Rashi/", "aside >> text=/^Rashi/", "text=/^Rashi$/"]) },
  { name: "switch language (Hebrew)", run: async (p) => {
      await clickFirst(p, [".readerOptions", '[aria-label="Text display options"]', 'button[aria-label*="display" i]']);
      await p.waitForTimeout(500);
      return clickFirst(p, ['.toggleOption[data-name="hebrew"]', '[role="radio"][aria-label="Hebrew"]', 'role=radio[name="Source"]', 'text="Source"', 'text="עברית"']);
    } },
  { name: 'search "light"', run: async (p) => {
      const box = p.locator('input[type="search"], input.search, [role="combobox"]').first();
      await box.click();
      await box.fill("light");
      await box.press("Enter");
      return p.waitForURL(/\/search/, { timeout: 15000 }).then(() => true);
    } },
  { name: "open a result", run: async (p) => {
      await p.waitForTimeout(3000);
      return clickFirst(p, ['a.searchResultCard-titleLink[data-search-result-position="1"]', '[aria-label="Search results"] li a']);
    } },
  { name: "open a topic", run: async (p, base) => {
      await p.goto(`${base}/topics`, { waitUntil: "domcontentloaded" });
      await p.waitForTimeout(2000);
      return clickFirst(p, ['a[href^="/topics/"]:not([href*="category"]):not([href*="/all/"])', 'main a[href*="/topics/"]:not([href*="category"]):not([href*="/all/"])']);
    } },
];

async function clickFirst(p, selectors) {
  for (const s of selectors) {
    const l = p.locator(s).first();
    const n = await Promise.race([l.count().catch(() => 0), new Promise((r) => setTimeout(() => r(-1), 5000))]);
    if (process.env.PARITY_DEBUG) console.error(`   ${s}: ${n}`);
    if (n > 0) {
      try {
        await l.click({ timeout: 5000 });
        return true;
      } catch {
        /* try the next */
      }
    }
  }
  return false;
}

async function session(base, label) {
  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const host = new URL(base).hostname;
  const cookieDomain = host === "localhost" ? "localhost" : `.${host.replace(/^www\./, "")}`;
  await ctx.addCookies([
    { name: "interfaceLang", value: "english", domain: cookieDomain, path: "/" },
    { name: "cookiesNotificationAccepted", value: "1", domain: cookieDomain, path: "/" },
  ]);
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (BLOCK_HOSTS.test(u.hostname) || isHit(u)) {
      blocked.push(`${req.method()} ${u.hostname}${u.pathname}`);
      return route.abort();
    }
    // the session stays on the site under test (a link to the other site would mix the two streams)
    if (req.isNavigationRequest() && req.frame() === req.frame().page().mainFrame() && u.origin !== new URL(base).origin) {
      blocked.push(`LEFT THE SITE: ${u.href}`);
      return route.abort();
    }
    // read-only: no write anywhere, except the search API (a POST that reads)
    if (req.method() !== "GET" && req.method() !== "HEAD" && req.method() !== "OPTIONS" && !/\/api\/search-wrapper|\/api\/search\b|_search$/.test(u.pathname)) {
      blocked.push(`${req.method()} ${u.hostname}${u.pathname}`);
      return route.abort();
    }
    return route.fallback();
  });
  const page = await ctx.newPage();
  const captured = [];
  let step = "(load)";
  await page.exposeFunction("__parityPush", (e) => captured.push({ ...e, step }));
  await page.addInitScript(HOOKS);
  const outcome = [];
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  for (const s of STEPS) {
    step = s.name;
    console.error(`[${label}] ${s.name}`);
    let ok = false;
    try {
      ok = (await s.run(page, base)) !== false;
    } catch (e) {
      ok = false;
      outcome.push({ step: s.name, error: String(e).split("\n")[0] });
    }
    await page.waitForTimeout(2500);
    if (!ok) outcome.push({ step: s.name, skipped: true });
  }
  const ids = await page.evaluate(() => ({
    gtm: [...document.scripts].map((s) => (s.src + s.textContent).match(/GTM-[A-Z0-9]+/)?.[0]).find(Boolean) ?? null,
    gtag: [...document.scripts].map((s) => (s.src + s.textContent).match(/G-[A-Z0-9]{6,}/)?.[0]).find(Boolean) ?? null,
  }));
  await browser.close();
  return { label, base, captured, blocked, outcome, ids };
}

/** One captured call → a comparable record, or null when it is ignored. */
function normalize(e) {
  const a = e.a;
  if (e.ch === "dl") {
    const [first, ...rest] = a;
    if (typeof first === "string") {
      if (first === "js") return null;
      if (first === "event") return IGNORED_EVENTS.has(rest[0]) ? null : { key: `gtag event ${rest[0]}`, params: rest[1] ?? {} };
      if (first === "config" || first === "set") return { key: `gtag ${first}${typeof rest[0] === "string" ? ` ${rest[0]}` : ""}`, params: (typeof rest[0] === "string" ? rest[1] : rest[0]) ?? {} };
      return { key: `gtag ${first}`, params: {} };
    }
    if (first && typeof first === "object") {
      if (typeof first.event === "string" && first.event.startsWith("gtm.")) return null; // GTM's bookkeeping
      const { event, ...params } = first;
      return { key: event ? `dataLayer ${event}` : `dataLayer {${Object.keys(first).sort().join(",")}}`, params: event ? params : first };
    }
    return null;
  }
  if (e.ch === "ga") {
    const [cmd, ...rest] = a;
    const c = String(cmd).replace(/^[^.]+\./, "");
    if (c === "create" || c === "require" || c.startsWith("linker")) return null; // GTM's own tracker setup
    if (c === "set" && typeof rest[0] === "object") return null; // GTM's &gtm/&gcd fields
    if (c === "send" && typeof rest[0] === "object") return null; // GTM's own hits (its tags), not the app's
    if (c === "send" && rest[0] === "event") return { key: `ga event ${rest[1]}|${rest[2]}`, params: { label: rest[3], value: rest[4] } };
    if (c === "set") return { key: `ga set ${rest[0]}`, params: { value: rest[1] } };
    return { key: `ga ${c} ${typeof rest[0] === "string" ? rest[0] : ""}`.trim(), params: {} };
  }
  if (e.ch === "sa") return { key: `sa ${a[0]}`, params: a[1] ?? {} };
  return null;
}

/** A JSON object in a string (result_counts) compared by content: its key order follows which API answered first, on both sites. */
const canonical = (v) => {
  if (typeof v !== "string" || !/^\{.*\}$/.test(v)) return v;
  try {
    const o = JSON.parse(v);
    return JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));
  } catch {
    return v;
  }
};
const stable = (params) => Object.fromEntries(Object.entries(params ?? {}).filter(([k, v]) => !VOLATILE.has(k) && v !== undefined).map(([k, v]) => [k, canonical(v)]).sort(([x], [y]) => x.localeCompare(y)));

function diff(L, N) {
  const out = [];
  let same = 0;
  for (const s of STEPS.map((x) => x.name)) {
    const l = L.captured.filter((e) => e.step === s).map(normalize).filter(Boolean);
    const n = N.captured.filter((e) => e.step === s).map(normalize).filter(Boolean);
    const lines = [];
    const used = new Set();
    for (const le of l) {
      const j = n.findIndex((ne, i) => !used.has(i) && ne.key === le.key);
      if (j < 0) {
        lines.push(`  - only legacy: ${le.key} ${JSON.stringify(stable(le.params))}`);
        continue;
      }
      used.add(j);
      const a = stable(le.params);
      const b = stable(n[j].params);
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      const d = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
      if (d.length) lines.push(`  ~ ${le.key}: ${d.join("; ")}`);
      else same++;
    }
    n.forEach((ne, i) => {
      if (!used.has(i)) lines.push(`  + only next:   ${ne.key} ${JSON.stringify(stable(ne.params))}`);
    });
    const skipped = [L, N].map((x) => (x.outcome.some((o) => o.step === s) ? x.label : null)).filter(Boolean);
    out.push(`## ${s}${skipped.length ? `   [step did not run on: ${skipped.join(", ")}]` : ""}`);
    out.push(...(lines.length ? lines : ["  (same)"]));
  }
  return { text: out.join("\n"), same };
}

const legacy = await session(LEGACY, "legacy");
console.error(`legacy tag IDs: GTM ${legacy.ids.gtm}, GA4 ${legacy.ids.gtag}`);
console.error(`run the new reader with: PUBLIC_SITE_ORIGIN= GOOGLE_TAG_MANAGER_CODE=${legacy.ids.gtm} GOOGLE_GTAG=${legacy.ids.gtag} SIMPLE_ANALYTICS_HOSTNAME=sefaria.org npm run dev`);
const next = await session(NEXT, "next");
if (!next.ids.gtag) console.error("WARNING: the new reader has no gtag configured: GA4 events are captured only through the harness's gtag stub, and there is no 'config'.");
const { text, same } = diff(legacy, next);
console.log(`# Analytics parity: ${LEGACY} vs ${NEXT}  (${new Date().toISOString()})`);
console.log(`# captured: legacy ${legacy.captured.length} calls, next ${next.captured.length} calls; ${same} matched with equal parameters`);
console.log(`# blocked (never sent): legacy ${legacy.blocked.length} requests, next ${next.blocked.length}`);
for (const x of [legacy, next]) for (const b of x.blocked.filter((b) => b.startsWith("LEFT"))) console.log(`# ${x.label}: ${b}`);
for (const x of [legacy, next]) for (const o of x.outcome) console.log(`# ${x.label}: step "${o.step}" ${o.skipped ? "did not find its control" : o.error}`);
console.log(text);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ legacy, next }, null, 1));
