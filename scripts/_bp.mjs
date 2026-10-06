import { chromium } from "playwright";
const b = await chromium.launch();
for (const w of [600, 700, 760, 842, 900]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
  await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
  const p = await ctx.newPage(); await p.goto("https://www.sefaria.org/texts", { waitUntil: "domcontentloaded" }); await p.waitForSelector(".header", { state: "attached" }); await p.waitForTimeout(1500);
  console.log(w, await p.evaluate(() => { const v = (s) => { const e = document.querySelector(s); if (!e) return "none"; const r = e.getBoundingClientRect(); return r.width ? `${Math.round(r.height)}h` : "hidden"; }; return { nav: v(".headerNavSection"), menuBtn: v(".menuButton"), header: v(".header") }; }));
  await ctx.close();
}
await b.close();
