import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(() => { window.__fl = []; const t0 = performance.now(); document.fonts.addEventListener("loadingdone", (e) => window.__fl.push([Math.round(performance.now() - t0), e.fontfaces.map((f) => f.family + " " + f.weight + " " + f.unicodeRange.slice(0, 20)).join(";")])); });
await p.goto("http://localhost:3100/Berakhot.3a.5?lang=he", { waitUntil: "networkidle" }); await p.waitForTimeout(1200);
const t1 = await p.evaluate(() => window.__fl.length);
const box = await p.locator("[data-reader-scroller]").boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + 300);
for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
console.log("before scroll", t1, "after", JSON.stringify(await p.evaluate(() => window.__fl.slice(0)), null, 0));
await b.close();
