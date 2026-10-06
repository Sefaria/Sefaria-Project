import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto("http://localhost:3100/Berakhot.3a.5?lang=he", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
const sample = () => p.evaluate(async () => {
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const c = document.querySelector("[data-reader-scroller]"); const rs = window.__readingScroll; const corr = rs ? rs.corrections.splice(0).reduce((a, b) => a + b, 0) : 0;
  const v = document.querySelector('[role="group"][data-ref="Berakhot 3a:5"]');
  return { top: v ? v.getBoundingClientRect().top : null, st: c.scrollTop, corr, secs: document.querySelectorAll("section[data-ref]").length, sh: c.scrollHeight, url: location.pathname };
});
const box = await p.locator("[data-reader-scroller]").boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + 300);
let a = await sample();
for (let i = 0; i < 40; i++) {
  await p.mouse.wheel(0, i < 25 ? -120 : 120); await p.waitForTimeout(60);
  const s = await sample(); const own = s.st - a.st - s.corr; const moved = s.top == null || a.top == null ? NaN : s.top - a.top;
  if (!(Math.abs(moved + own) <= 1.5)) console.log(i, "moved", moved, "own", own, "corr", s.corr, "secs", a.secs, "->", s.secs, "sh", a.sh, "->", s.sh, "st", a.st, "->", s.st);
  a = s;
}
console.log(JSON.stringify(await p.evaluate(() => window.__columnMounts)), await p.evaluate(() => location.href));
await b.close();
