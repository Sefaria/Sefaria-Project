import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
p.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 200)));
await p.goto("http://localhost:3100/Genesis.1"); await p.waitForSelector("html[data-hydrated='true']"); await p.waitForTimeout(5000);
console.log(await p.evaluate(() => ({ cols: document.querySelectorAll("[data-testid=text-column]").length, probe: (() => { const d = document.querySelector('[data-testid="banner-probe"]'); if (!d) return null; const r = d.getBoundingClientRect(); return [r.top, r.left, r.width, r.height]; })(), log: window.__SEFARIA_ANALYTICS__.map((e) => e.name + " " + JSON.stringify(e.params ?? {})), ss: Object.keys(sessionStorage) })));
await b.close();
