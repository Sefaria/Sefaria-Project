import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("framenavigated", (f) => f === p.mainFrame() && console.log("NAV", f.url()));
await p.goto("http://localhost:3100/Berakhot.3a.5?lang=he", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
await p.evaluate(() => { const h = history; const rs = h.replaceState.bind(h), ps = h.pushState.bind(h); h.replaceState = (s, t, u) => { console.log("REPLACE", u, JSON.stringify(s?.state ?? s).slice(0, 80)); return rs(s, t, u); }; h.pushState = (s, t, u) => { console.log("PUSH", u); return ps(s, t, u); }; });
p.on("console", (m) => /REPLACE|PUSH|RESTART/.test(m.text()) && console.log(m.text()));
const box = await p.locator("[data-reader-scroller]").boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + 300);
for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
console.log(await p.evaluate(() => [location.href, JSON.stringify(window.__columnMounts)]));
await b.close();
