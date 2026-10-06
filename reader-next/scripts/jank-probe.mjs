// Jank probe. A reader sees a "jump" when a verse moves on screen by anything other than their own scrolling.
// For every wheel step this compares the verse's on-screen movement with the reader's own scroll
// (scroll-position change minus the engine's deliberate corrections). Also reports layout shift (CLS) on load
// and throughout. Usage: STEP=100 WAIT=60 node scripts/jank-probe.mjs [baseUrl] [path] [verseRef]
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3100";
const path = process.argv[3] ?? "/Genesis.2.3?lang=en";
const verse = process.argv[4] ?? "Genesis 2:3";
const step = Number(process.env.STEP ?? 100);
const wait = Number(process.env.WAIT ?? 60);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 860) } });
await p.addInitScript((verse) => {
  window.__cls = 0;
  window.__shiftLog = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__cls += e.value; if (e.value > 0.05) window.__shiftLog.push({ v: +e.value.toFixed(3), input: e.hadRecentInput, src: (e.sources || []).map((x) => ({ n: x.node?.nodeName + "." + String(x.node?.className || x.node?.dataset?.testid || "").slice(0, 25) + (x.node?.dataset?.ref ? "[" + x.node.dataset.ref + "]" : ""), from: Math.round(x.previousRect.top), to: Math.round(x.currentRect.top) })) }); } }).observe({ type: "layout-shift", buffered: true });
  window.__frames = []; window.__corrTotal = 0;
  window.__track = []; const t0 = performance.now();
  const tick = () => {
    const el = document.querySelector(`[role="group"][data-ref="${verse}"]`);
    if (el) {
      const top = el.getBoundingClientRect().top;
      if (window.__track.at(-1)?.top !== Math.round(top)) window.__track.push({ t: Math.round(performance.now() - t0), top: Math.round(top) });
      const sc = document.querySelector("[data-reader-scroller]");
      const scroller = sc && getComputedStyle(sc).overflowY === "auto" ? sc : document.scrollingElement;
      const rs = window.__readingScroll;
      const corr = rs ? rs.corrections.reduce((a, b) => a + b, 0) + (rs.__drained ?? 0) : 0;
      window.__frames.push({ top, st: scroller.scrollTop, corr, n: document.querySelectorAll("[data-language] section[data-ref]").length });
    }
    // Sample after each paint (rAF → task): sampling inside rAF forces a layout before the engine's
    // ResizeObserver corrections run, reporting states that are never painted.
    requestAnimationFrame(() => setTimeout(tick, 0));
  };
  requestAnimationFrame(() => setTimeout(tick, 0));
}, verse);
await p.goto(base + path); await p.waitForSelector("html[data-hydrated='true']"); await p.waitForTimeout(2500);
const load = await p.evaluate(() => ({ cls: +window.__cls.toFixed(4), track: window.__track }));
console.log(`LOAD: verse positions ${JSON.stringify(load.track)}  CLS ${load.cls}`);
const sample = () => p.evaluate((v) => {
  const sc = document.querySelector("[data-reader-scroller]");
  const scroller = getComputedStyle(sc).overflowY === "auto" ? sc : document.scrollingElement;
  const s = window.__readingScroll; let corr = 0;
  if (s) { corr = s.corrections.splice(0).reduce((a, b) => a + b, 0); s.__drained = (s.__drained ?? 0) + corr; }
  return { top: document.querySelector(`[role="group"][data-ref="${v}"]`).getBoundingClientRect().top, scrollTop: scroller.scrollTop, corr };
}, verse);
const secs = () => p.evaluate(() => [...document.querySelectorAll("[data-language] section[data-ref]")].map((s) => s.dataset.ref).join(" | "));
await p.mouse.move(500, 450);
await sample();
let jumps = 0, steps = 0;
for (const [dir, n] of [[-1, Math.ceil(3000 / step)], [1, Math.ceil(6000 / step)]]) {
  for (let i = 0; i < n; i++) {
    const a = await sample();
    await p.mouse.wheel(0, dir * step); await p.waitForTimeout(wait);
    const bb = await sample();
    const userScroll = bb.scrollTop - a.scrollTop - bb.corr;
    const moved = bb.top - a.top;
    steps++;
    if (Math.abs(moved + userScroll) > 1.5) { jumps++; console.log(`  JUMP step ${steps}: verse moved ${moved.toFixed(1)}px but the reader scrolled ${userScroll.toFixed(1)}px (corrections ${bb.corr}) — sections: ${await secs()}`); }
  }
}
const frames = await p.evaluate(() => window.__frames);
let frameJumps = 0;
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1], c = frames[i];
  const user = c.st - a.st - (c.corr - a.corr);
  const moved = c.top - a.top;
  if (Math.abs(moved + user) > 1.5) { frameJumps++; if (frameJumps <= 5) console.log(`  FRAME JUMP ${i}: verse moved ${moved.toFixed(1)} vs reader scroll ${user.toFixed(1)}; sections ${a.n}→${c.n}; corrections ${(c.corr - a.corr)}`); }
}
console.log(`frames ${frames.length}, frames with a visible jump: ${frameJumps}`);
const big = await p.evaluate(() => window.__shiftLog);
if (big.length) console.log("LARGE SHIFTS", JSON.stringify(big));
if (process.env.FRAMES) {
  for (let i = 1; i < frames.length; i++) if (frames[i].n !== frames[i - 1].n) {
    console.log(`  around prepend at frame ${i}:`, frames.slice(Math.max(0, i - 3), i + 8).map((f) => `st=${Math.round(f.st)} n=${f.n} corr=${f.corr}`).join("  |  "));
  }
}
console.log("column mounts:", JSON.stringify(await p.evaluate(() => window.__columnMounts)));
console.log(`sections: ${await secs()}`);
console.log(`steps ${steps}, visible jumps ${jumps}, CLS total ${await p.evaluate(() => +window.__cls.toFixed(4))}`);
await b.close();
process.exit(jumps ? 1 : 0);
