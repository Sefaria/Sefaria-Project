import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: ".sefaria.org", path: "/" }]);
const p = await ctx.newPage();
await p.addInitScript(() => {
  window.__log = [];
  const wrap = () => { const dl = window.dataLayer = window.dataLayer || []; const push = dl.push.bind(dl); dl.push = (...a) => { try { window.__log.push(JSON.parse(JSON.stringify(Array.from(a[0]?.length !== undefined && typeof a[0] !== "string" ? a[0] : a[0] ?? [])))); } catch { window.__log.push(String(a[0])); } return push(...a); }; };
  wrap();
});
const sent = [];
p.on("request", (r) => { const u = r.url(); if (/google-analytics\.com\/g\/collect|simpleanalytics|sentry/.test(u)) sent.push(u.slice(0, 400)); });
await p.goto("https://www.sefaria.org/Genesis.1", { waitUntil: "load" });
await p.waitForTimeout(8000);
const info = await p.evaluate(() => ({ ga: typeof window.ga, gaGetAll: typeof window.ga?.getAll === "function" ? window.ga.getAll().length : null, gtag: typeof window.gtag, sa: typeof window.sa_event, sa_metadata: window.sa_metadata, log: window.__log.slice(0, 40), dl: (window.dataLayer || []).slice(0, 30).map((x) => { try { return JSON.parse(JSON.stringify(Array.from(x.length !== undefined ? x : [x]))); } catch { return String(x); } }) }));
console.log(JSON.stringify(info, null, 1).slice(0, 6000));
console.log("SENT:\n" + sent.join("\n"));
await b.close();
