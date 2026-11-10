// Ways out to the legacy client (T-F01; wiki projects/reader-next/exits-to-legacy.md). Crawls the new reader's page types, desktop and
// phone, signed out and signed in; collects every same-site link; asks the reader's server (with pass-through to Django on) for each
// and follows its redirects; a link that ends on a page Django renders (`x-served-by: django`) is a way out. Ways out that are not
// in scripts/exits-allowlist.json fail the run (exit 1), unless --report-only.
//
//   node scripts/exits-crawl.mjs [--report-only] [--quick] [--out exits.json] [--md exits.md]
//   node scripts/exits-crawl.mjs --serve   only start the stand-in Django and the reader's server (for e2e/routing-pass-through.spec.ts)
//
// It starts what it needs and stops it after:
//   - a read-only proxy in front of the live site (EXITS_UPSTREAM, default https://www.sefaria.org) that plays Django for the
//     reader's server. It never forwards a write (any non-GET is answered {} here), sends no reader cookie but interfaceLang=english,
//     and a user agent with "Sefaria/" (Django's language middleware never moves those to sefaria.org.il). For the signed-in pass it
//     answers the session and the reader's stats itself (a stand-in reader, `sessionid=exits-crawl`), so the header, menus and
//     signed-in pages render signed in without any real account;
//   - the reader's dev server (EXITS_PORT, default 3366) with SEFARIA_PASS_THROUGH=1 and that proxy as its Django and API, same-origin
//     links as in production (PUBLIC_SITE_ORIGIN="", PUBLIC_API_ORIGIN="").
// EXITS_BASE=<url> uses a running reader server instead (e.g. a cauldron in optin mode with EXITS_COOKIE for a real session).
//
// CI: run with --report-only until wave 2 has ported what the list names (LAUNCH_PLAN §5 F); then without it, as a gate.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const REPORT_ONLY = flag("--report-only") || process.env.EXITS_REPORT_ONLY === "1";
const QUICK = flag("--quick");
const UPSTREAM = process.env.EXITS_UPSTREAM || "https://www.sefaria.org";
const PORT = Number(process.env.EXITS_PORT) || 3366;
const PROXY_PORT = Number(process.env.EXITS_PROXY_PORT) || PORT + 1;
const ROOT = new URL("..", import.meta.url).pathname;
const ALLOW = JSON.parse(readFileSync(new URL("./exits-allowlist.json", import.meta.url), "utf8")).entries;
const FAKE_SESSION = "exits-crawl";
const CRAWL_UA = "Mozilla/5.0 (exits-crawl; Sefaria/reader-next)";

/** The new reader's page types (LAUNCH_PLAN T-F01). */
const SIDEBAR = ["all", "Sheets", "Topics", "Translations", "About", "WebPages", "Notes"];
const PAGES = QUICK
  ? ["/texts", "/Genesis.1.1?with=all", "/topics"]
  : [
      "/texts",
      "/texts/Tanakh",
      "/texts/Talmud/Bavli",
      "/texts/Mishnah",
      "/Genesis",
      "/Berakhot",
      "/Genesis.1",
      ...SIDEBAR.map((w) => `/Genesis.1.1?with=${w}`),
      "/Berakhot.2a",
      ...SIDEBAR.map((w) => `/Berakhot.2a.1?with=${w}`),
      "/topics",
      "/topics/all/a",
      "/topics/category/biblical-figures",
      "/topics/category/authors",
      "/topics/moses",
      "/topics/rashi",
      "/search?q=shabbat&tab=text",
      "/search?q=rashi&tab=topics",
      "/translations/es",
      "/translations/de",
      "/calendars",
      "/compare",
      "/login",
      "/register",
      "/saved",
      "/history",
      "/texts/notes",
    ];

// ---------------------------------------------------------------- the read-only stand-in for Django
const cache = new Map();
function startProxy() {
  const server = createServer(async (req, res) => {
    const cookie = req.headers.cookie ?? "";
    const signedIn = new RegExp(`(?:^|;\\s*)sessionid=${FAKE_SESSION}(?:;|$)`).test(cookie);
    const url = req.url ?? "/";
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "GET" && req.method !== "HEAD") return json(200, {}); // never a write upstream
    if (signedIn && url.startsWith("/_allauth/browser/v1/auth/session"))
      return json(200, { status: 200, meta: { is_authenticated: true }, data: { user: { id: 990001, display: "Exits Crawler", email: "crawler@example.org" } } });
    if (signedIn && url.startsWith("/api/user_stats/")) return json(200, { name: "Exits Crawler", profileUrl: "/profile/exits-crawler", isStaff: false });
    if (signedIn && /^\/api\/(profile\/user_history|user_history|notes)/.test(url)) return json(200, []);
    const key = `${signedIn ? "in" : "out"} ${url}`;
    let hit = cache.get(key);
    if (!hit) {
      try {
        const r = await fetch(`${UPSTREAM}${url}`, { redirect: "manual", headers: { "user-agent": CRAWL_UA, "accept-encoding": "identity", cookie: "interfaceLang=english", accept: req.headers.accept ?? "*/*" } });
        const body = Buffer.from(await r.arrayBuffer());
        const headers = {};
        for (const h of ["content-type", "location", "cache-control"]) if (r.headers.get(h)) headers[h] = r.headers.get(h);
        if (headers.location?.startsWith(UPSTREAM)) headers.location = headers.location.slice(UPSTREAM.length) || "/";
        hit = { status: r.status, headers, body };
        if (r.status < 500) cache.set(key, hit);
      } catch (e) {
        hit = { status: 502, headers: { "content-type": "text/plain" }, body: Buffer.from(String(e)) };
      }
    }
    res.writeHead(hit.status, hit.headers);
    res.end(req.method === "HEAD" ? undefined : hit.body);
  });
  return new Promise((ok) => server.listen(PROXY_PORT, () => ok(server)));
}

async function waitFor(url, ms = 120_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { headers: { cookie: "interfaceLang=english" } });
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} did not answer`);
}

// ---------------------------------------------------------------- crawl
const isVoices = (host) => ALLOW.some((a) => a.host && new RegExp(a.host).test(host));
function allowed(pathAndQuery, host) {
  for (const a of ALLOW) {
    if (a.host && host && new RegExp(a.host).test(host)) return a.id;
    if (a.match && new RegExp(a.match).test(pathAndQuery)) return a.id;
  }
  return null;
}

async function collectLinks(page, path, phone) {
  const found = new Set();
  const grab = async () => {
    for (const h of await page.$$eval("a[href]", (as) => as.map((a) => a.href))) found.add(h);
  };
  try {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("html[data-hydrated='true']", { timeout: 60_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await grab();
    // menus that render their links only when open: the phone menu, the header's drop-downs
    const buttons = phone ? page.getByRole("button", { name: /^(Menu|תפריט)$/ }) : page.locator("header button[aria-haspopup]");
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible().catch(() => false))) continue;
      await b.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      await grab();
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  } catch (e) {
    console.error(`[crawl] ${path}: ${String(e).split("\n")[0]}`);
  }
  return found;
}

/** Ask the reader's server for a link, following redirects on this site; what answered in the end. */
async function resolve(base, href, cookie) {
  const chain = [];
  let url = new URL(href);
  for (let hop = 0; hop < 6; hop++) {
    const r = await fetch(url, { redirect: "manual", headers: { cookie, "user-agent": "Mozilla/5.0 Chrome/130", accept: "text/html" } }).catch((e) => ({ status: 0, headers: new Headers(), error: e }));
    const by = r.headers.get("x-served-by") ?? "reader";
    chain.push(`${r.status} ${by}`);
    await r.body?.cancel?.().catch(() => undefined);
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) {
      const next = new URL(loc, url);
      if (next.origin !== new URL(base).origin) return { chain, final: { status: r.status, by, offsite: next.href, host: next.host } };
      // Django asking for a sign-in: the stand-in session is not Django's, so for a signed-in reader this is Django's own page
      if (by === "django" && /^\/login(?:\/|$)/.test(next.pathname)) return { chain: [...chain, `→ ${next.pathname}`], final: { status: r.status, by, loginRequired: true, path: url.pathname + url.search } };
      chain.push(`→ ${next.pathname}${next.search}`);
      url = next;
      continue;
    }
    return { chain, final: { status: r.status, by, path: url.pathname + url.search } };
  }
  return { chain, final: { status: 0, by: "loop" } };
}

async function main() {
  let proxy, dev;
  let base = process.env.EXITS_BASE;
  if (!base) {
    // a server already on the port would be crawled instead of ours: refuse
    const busy = await fetch(`http://localhost:${PORT}/`).then(() => true, () => false);
    if (busy) throw new Error(`port ${PORT} is in use: set EXITS_PORT`);
    proxy = await startProxy();
    base = `http://localhost:${PORT}`;
    const env = { ...process.env, PORT: String(PORT), SEFARIA_PASS_THROUGH: "1", SEFARIA_API_ORIGIN: `http://localhost:${PROXY_PORT}`, PUBLIC_API_ORIGIN: "", PUBLIC_SITE_ORIGIN: "" };
    dev = spawn("npx", ["vite", "dev", "--port", String(PORT), "--strictPort"], { cwd: ROOT, env, stdio: ["ignore", "ignore", "inherit"], detached: true });
    await waitFor(`${base}/texts`);
    if (flag("--serve")) {
      // only the stand-in Django and the reader's server, for e2e/routing-pass-through.spec.ts (signed in with sessionid=exits-crawl)
      console.log(`serving ${base} (stand-in Django on :${PROXY_PORT}); Ctrl-C stops`);
      const stop = () => {
        try {
          process.kill(-dev.pid);
        } catch {
          dev.kill();
        }
        proxy.close();
        process.exit(0);
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      return new Promise(() => undefined);
    }
  }
  const host = new URL(base).host;
  const siteHosts = new Set([host, "www.sefaria.org", "sefaria.org"]);
  const contexts = [
    { name: "desktop signed out", phone: false, signedIn: false },
    { name: "phone signed out", phone: true, signedIn: false },
    { name: "desktop signed in", phone: false, signedIn: true },
    { name: "phone signed in", phone: true, signedIn: true },
  ];
  let browser = await chromium.launch();
  /** link (path+query or voices URL) → { href, from: Set, contexts: Set } */
  const links = new Map();
  try {
    for (const c of contexts) {
      const domain = new URL(base).hostname;
      const cookies = [
        { name: "interfaceLang", value: "english", domain, path: "/" },
        { name: "cookiesNotificationAccepted", value: "1", domain, path: "/" },
        ...(c.signedIn ? [{ name: "sessionid", value: process.env.EXITS_COOKIE || FAKE_SESSION, domain, path: "/" }] : []),
      ];
      let ctx, page;
      // a fresh context (and browser, if it went away: a crashed renderer must not end the crawl) for this context's pages
      const fresh = async () => {
        await ctx?.close().catch(() => undefined);
        if (!browser.isConnected()) browser = await chromium.launch();
        ctx = await browser.newContext(c.phone ? { ...devices["Pixel 7"], baseURL: base } : { viewport: { width: 1280, height: 900 }, baseURL: base });
        await ctx.addCookies(cookies);
        page = await ctx.newPage();
      };
      await fresh();
      for (const path of PAGES) {
        if (page.isClosed() || !browser.isConnected()) await fresh();
        let found = await collectLinks(page, path, c.phone);
        if (!found.size) {
          await fresh();
          found = await collectLinks(page, path, c.phone);
        }
        for (const h of found) {
          let u;
          try {
            u = new URL(h);
          } catch {
            continue;
          }
          if (!/^https?:$/.test(u.protocol)) continue;
          const voices = isVoices(u.host);
          if (!siteHosts.has(u.host) && !voices) continue;
          const key = voices ? `${u.host}${u.pathname}` : `${u.pathname}${u.search}`;
          const e = links.get(key) ?? { key, voices, host: u.host, from: new Set(), contexts: new Set() };
          e.from.add(path);
          e.contexts.add(c.name);
          links.set(key, e);
        }
      }
      await ctx.close().catch(() => undefined);
      console.error(`[crawl] ${c.name}: ${links.size} distinct same-site links so far`);
    }
    // ask the reader's server about each (signed in when a signed-in page had it)
    const entries = [...links.values()];
    const results = [];
    let i = 0;
    const worker = async () => {
      while (i < entries.length) {
        const e = entries[i++];
        if (e.voices) {
          results.push({ ...e, exit: "voices", allow: allowed("", e.host) });
          continue;
        }
        const signedIn = [...e.contexts].every((c) => c.endsWith("signed in"));
        const cookie = `interfaceLang=english${signedIn ? `; sessionid=${process.env.EXITS_COOKIE || FAKE_SESSION}` : ""}`;
        const r = await resolve(base, `${base}${e.key}`, cookie);
        const f = r.final;
        let exit = null;
        if (f.offsite) exit = isVoices(f.host) ? "voices" : "offsite";
        else if (f.loginRequired) exit = [...e.contexts].some((c) => c.endsWith("signed in")) ? "django-page (signed in)" : null;
        else if (f.by === "django" && f.status >= 200 && f.status < 300) exit = "django-page";
        else if (f.by === "django" && f.status === 404) exit = "django-404";
        else if (f.by === "django" && f.status >= 400) exit = `django-${f.status}`;
        results.push({ ...e, chain: r.chain, final: f, exit, allow: exit ? allowed(e.key, f.host) ?? (exit === "voices" ? "voices-host" : null) : null });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    const exits = results.filter((r) => r.exit && r.exit !== "offsite").sort((a, b) => a.key.localeCompare(b.key));
    const unlisted = exits.filter((r) => !r.allow);
    const plain = (r) => ({ link: r.voices ? `https://${r.key}` : r.key, exit: r.exit, chain: r.chain, allow: r.allow, contexts: [...r.contexts], from: [...r.from].slice(0, 5) });
    const report = { at: new Date().toISOString(), base, upstream: UPSTREAM, pages: PAGES.length, contexts: contexts.map((c) => c.name), links: results.length, exits: exits.length, unlisted: unlisted.map(plain), allowlisted: exits.filter((r) => r.allow).map(plain) };
    if (opt("--out")) writeFileSync(opt("--out"), JSON.stringify(report, null, 2) + "\n");
    const md = [
      `# Exits to the legacy client (${report.at})`,
      "",
      `${report.pages} page types × ${contexts.length} contexts; ${report.links} distinct same-site links; ${report.exits} answered by Django or Voices; **${unlisted.length} not in the allowlist**.`,
      "",
      "| Link | Answer | Seen on | Contexts |",
      "|---|---|---|---|",
      ...unlisted.map((r) => `| \`${r.key}\` | ${r.exit} (${(r.chain ?? []).join(" ")}) | ${[...r.from].slice(0, 3).join(", ")} | ${[...r.contexts].join("; ")} |`),
      "",
      `Allowlisted: ${Object.entries(Object.groupBy(exits.filter((r) => r.allow), (r) => r.allow)).map(([k, v]) => `${k} ${v.length}`).join(", ") || "none"}.`,
    ].join("\n");
    if (opt("--md")) writeFileSync(opt("--md"), md + "\n");
    console.log(md);
    process.exitCode = unlisted.length && !REPORT_ONLY ? 1 : 0;
  } finally {
    await browser.close();
    if (dev) {
      try {
        process.kill(-dev.pid);
      } catch {
        dev.kill();
      }
    }
    proxy?.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
