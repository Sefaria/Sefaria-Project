// Pixel parity of the text itself: the first segments of each text, live vs rebuild, cropped to the same box, at desktop and
// phone width. Writes docs/parity/<name>-<width>-{live,ours}.png and prints the share of differing pixels (scripts/parity-diff.py).
// Usage: node scripts/parity-shots.mjs ['name=/Path?query' ...]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const DEFAULT = {
  "genesis-bi": "/Genesis.1?lang=bi", "genesis-he": "/Genesis.1?lang=he", "genesis-en": "/Genesis.1?lang=en",
  "berakhot-bi": "/Berakhot.2a?lang=bi", "berakhot-he": "/Berakhot.2a?lang=he", "psalms-bi": "/Psalms.23?lang=bi",
  "mishnah-bi": "/Mishnah_Berakhot.1?lang=bi", "rashi-bi": "/Rashi_on_Genesis.1?lang=bi", "ramban-en": "/Ramban_on_Genesis.1?lang=en",
  "zohar-bi": "/Zohar,_Bereshit.1?lang=bi", "siddur-bi": "/Siddur_Ashkenaz,_Weekday,_Shacharit,_Preparatory_Prayers,_Modeh_Ani?lang=bi",
  "haggadah-bi": "/Pesach_Haggadah,_Kadesh?lang=bi", "arukh-en": "/Arukh_HaShulchan,_Orach_Chaim.1?lang=en", "jt-bi": "/Jerusalem_Talmud_Berakhot.1.1?lang=bi",
  "mishneh-torah-bi": "/Mishneh_Torah,_Foundations_of_the_Torah.1?lang=bi", "kuzari-bi": "/Kuzari.1?lang=bi", "philo-he": "/On_the_Account_of_the_World's_Creation.1?lang=he",
};
const targets = process.argv.length > 2 ? Object.fromEntries(process.argv.slice(2).map((a) => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)])) : DEFAULT;
const SIZES = [[1280, 860], [390, 844]];
mkdirSync("docs/parity", { recursive: true });
const b = await chromium.launch();
async function shot(page, side, file, w) {
  const sel = side === "live" ? ".readerPanel .segment" : '[data-reader-scroller] [role="group"][data-ref]';
  await page.waitForSelector(sel, { timeout: 25000 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.GuideOverlay,.readerMessageBox").forEach((n) => n.remove()));
  await page.waitForTimeout(1800);
  // bring the first segment to a fixed place in the viewport, then crop the same box on both sides
  await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: "start" }); const sc = [...document.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 50 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.contains(el)); if (sc) sc.scrollTop += el.getBoundingClientRect().top - 140; else window.scrollBy(0, el.getBoundingClientRect().top - 140); }, sel);
  await page.waitForTimeout(500);
  const box = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; }, sel);
  const x = Math.max(0, Math.round(w <= 500 ? 0 : (1280 - 700) / 2 - 60)), width = w <= 500 ? w : 820;
  await page.screenshot({ path: file, clip: { x, y: 120, width, height: 560 } });
  return box;
}
for (const [w, h] of SIZES) {
  // a phone is a phone User-Agent: sefaria.org decides single-panel mode (and its paddings) from it, not from the width
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(w <= 500 ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" } : {}) });
  await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
  const live = await ctx.newPage(), ours = await ctx.newPage();
  for (const [name, path] of Object.entries(targets)) {
    await Promise.all([live.goto("https://www.sefaria.org" + path, { waitUntil: "domcontentloaded" }), ours.goto("http://localhost:3100" + path, { waitUntil: "domcontentloaded" })]);
    const a = await shot(live, "live", `docs/parity/${name}-${w}-live.png`, w);
    const o = await shot(ours, "ours", `docs/parity/${name}-${w}-ours.png`, w);
    console.log(`shot ${w} ${name} live-seg x=${Math.round(a.x)} w=${Math.round(a.w)}  ours-seg x=${Math.round(o.x)} w=${Math.round(o.w)}`);
  }
  await ctx.close();
}
await b.close();
