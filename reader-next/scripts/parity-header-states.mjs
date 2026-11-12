// Header states, live vs rebuild: the focused search box, each drop-down open, the phone menu open. Writes
// docs/parity/state-<name>-{live,ours}.png (compare with scripts/parity-diff-page.py state-).
import { chromium } from "playwright";
const OURS = process.env.OURS ?? "http://localhost:3100";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const NOISE = "#credential_picker_container,#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.GuideOverlay,.readerMessageBox,#bannerMessage,.promo,[class*='Promo'],.sidebarPromo";
// [name, phone?, live selector to click, ours selector to click, clip]
const STATES = [
  ["search-focus", false, "input.search", "header input[role=combobox]", { x: 600, y: 0, width: 680, height: 60 }],
  ["lang-menu", false, "button[aria-label='Toggle Interface Language Menu']", "header button[aria-label='Toggle Interface Language Menu']", { x: 880, y: 0, width: 400, height: 300 }],
  ["module-menu", false, "button[aria-label='Library']", "header button[aria-label='Library']", { x: 880, y: 0, width: 400, height: 360 }],
  ["account-menu", false, "button[aria-label='Account menu']", "header button[aria-label='Account menu']", { x: 880, y: 0, width: 400, height: 420 }],
  ["phone-menu", true, ".menuButton", "header button[aria-controls='mobile-nav']", { x: 0, y: 0, width: 390, height: 844 }],
];
const b = await chromium.launch();
for (const [name, phone, liveSel, oursSel, clip] of STATES) {
  const ctx = await b.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 }, deviceScaleFactor: 1, ...(phone ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA } : {}) });
  await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
  for (const [side, origin, sel] of [["live", "https://www.sefaria.org", liveSel], ["ours", OURS, oursSel]]) {
    const page = await ctx.newPage();
    await page.goto(origin + "/texts", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    if (side === "ours") await page.waitForSelector("html[data-hydrated='true']", { timeout: 20000 }).catch(() => {});
    await page.evaluate((s) => document.querySelectorAll(s).forEach((n) => n.remove()), NOISE);
    await page.locator(sel).filter({ visible: true }).first().click();
    await page.waitForTimeout(800);
    await page.mouse.move(0, 899);
    await page.screenshot({ path: `docs/parity/state-${name}-${side}.png`, clip });
    await page.close();
  }
  await ctx.close();
  console.log("shot", name);
}
await b.close();
