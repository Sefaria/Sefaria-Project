// Layout parity: geometry and type of the first segment of a text, live vs rebuild, at desktop and phone width.
// Usage: node scripts/parity-layout.mjs [ref=/Path?query ...]
import { chromium } from "playwright";
const DEFAULT = {
  "genesis-bi": "/Genesis.1?lang=bi", "genesis-he": "/Genesis.1?lang=he", "genesis-en": "/Genesis.1?lang=en",
  "berakhot-bi": "/Berakhot.2a?lang=bi", "berakhot-he": "/Berakhot.2a?lang=he",
  "rashi-bi": "/Rashi_on_Genesis.1?lang=bi", "psalms-bi": "/Psalms.23?lang=bi", "mishnah-bi": "/Mishnah_Berakhot.1?lang=bi",
  "zohar-bi": "/Zohar,_Bereshit.1?lang=bi", "siddur-bi": "/Siddur_Ashkenaz,_Weekday,_Shacharit,_Preparatory_Prayers,_Modeh_Ani?lang=bi",
};
const targets = process.argv.length > 2 ? Object.fromEntries(process.argv.slice(2).map((a) => a.split("="))) : DEFAULT;
const SIZES = [[1280, 860], [390, 844]];
const b = await chromium.launch();
const measure = (side) => {
  const seg = document.querySelector(side === "live" ? ".readerPanel .segment" : '[data-reader-scroller] [role="group"]');
  if (!seg) return null;
  const r = (el) => { if (!el) return null; const q = el.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), w: Math.round(q.width), h: Math.round(q.height) }; };
  const cs = (el) => { if (!el) return null; const c = getComputedStyle(el); return { size: c.fontSize, lh: c.lineHeight, ff: c.fontFamily.split(",")[0].replace(/["']/g, ""), color: c.color, dir: c.direction, align: c.textAlign }; };
  const textEls = side === "live" ? [...seg.querySelectorAll(".segmentText .contentSpan, .segmentText span")] : [...seg.querySelectorAll("p span[lang]")];
  const he = textEls.find((e) => e.lang === "he"), en = textEls.find((e) => e.lang === "en");
  const num = side === "live" ? seg.querySelector(".segmentNumber") : seg.querySelector("span[aria-hidden]");
  const title = side === "live" ? document.querySelector(".readerPanel .sectionHeader, .readerPanel .sectionTitle, .readerPanel h1, .readerPanel .parashaHeader") : document.querySelector('[data-reader-scroller] h2, [data-reader-scroller] h1');
  const bar = side === "live" ? document.querySelector(".readerControls") : document.querySelector("header");
  return { seg: r(seg), he: r(he), heStyle: cs(he), en: r(en), enStyle: cs(en), num: r(num), numStyle: cs(num), title: r(title), titleStyle: cs(title), bar: r(bar) };
};
let diffs = 0;
for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
  const live = await ctx.newPage(), ours = await ctx.newPage();
  for (const [name, path] of Object.entries(targets)) {
    await live.goto("https://www.sefaria.org" + path, { waitUntil: "domcontentloaded" });
    await ours.goto("http://localhost:3100" + path, { waitUntil: "domcontentloaded" });
    await live.waitForSelector(".segment", { timeout: 25000 }).catch(() => {});
    await ours.waitForSelector('[role="group"][data-ref]', { timeout: 25000 }).catch(() => {});
    await live.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.GuideOverlay").forEach((n) => n.remove()));
    await live.waitForTimeout(1500); await ours.waitForTimeout(800);
    const a = await live.evaluate(measure, "live"), o = await ours.evaluate(measure, "ours");
    const lines = [];
    for (const k of Object.keys(a ?? {})) {
      const x = JSON.stringify(a[k]), y = JSON.stringify(o?.[k]);
      if (x !== y) lines.push(`   ${k}\n     live: ${x}\n     ours: ${y}`);
    }
    diffs += lines.length ? 1 : 0;
    console.log(`${lines.length ? "DIFF" : "SAME"} ${w}px ${name}`);
    for (const l of lines) console.log(l);
  }
  await ctx.close();
}
await b.close();
console.log(diffs ? `${diffs} differ` : "all same");
