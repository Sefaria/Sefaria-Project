// Whole-page pixel parity, live vs rebuild, at desktop and phone size: a viewport shot, a full-page shot and the site header.
// Writes docs/parity/page-<name>-<w>[-full|-header]-{live,ours}.png; compare with scripts/parity-diff.py.
// Usage: node scripts/parity-page.mjs ['name=/path' ...]   (default: texts=/texts)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const targets = process.argv.length > 2 ? Object.fromEntries(process.argv.slice(2).map((a) => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)])) : { texts: "/texts" };
const OURS = process.env.OURS ?? "http://localhost:3100";
const SIZES = [[1280, 900], [390, 844]];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
// promotions and one-off overlays that live shows and we do not (yet) have
const NOISE = "#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.GuideOverlay,.readerMessageBox,#bannerMessage,.promo,[class*='Promo'],.sidebarPromo";
mkdirSync("docs/parity", { recursive: true });
const b = await chromium.launch();
for (const [w, h] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(w <= 500 ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA } : {}) });
  await ctx.addCookies([
    { name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" },
    { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" },
    { name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" },
  ]);
  const live = await ctx.newPage(), ours = await ctx.newPage();
  for (const [name, path] of Object.entries(targets)) {
    for (const [side, page, origin] of [["live", live, "https://www.sefaria.org"], ["ours", ours, OURS]]) {
      await page.goto(origin + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await page.evaluate((sel) => document.querySelectorAll(sel).forEach((n) => n.remove()), NOISE);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);
      const base = `docs/parity/page-${name}-${w}`;
      await page.screenshot({ path: `${base}-${side}.png` });
      await page.screenshot({ path: `${base}-header-${side}.png`, clip: { x: 0, y: 0, width: w, height: w <= 500 ? 60 : 60 } });
      await page.screenshot({ path: `${base}-full-${side}.png`, fullPage: true });
    }
    console.log(`shot ${w} ${name}`);
  }
  await ctx.close();
}
await b.close();
