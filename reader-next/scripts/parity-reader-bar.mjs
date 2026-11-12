// The reader's top bar and its "Aa" display menu, live vs rebuild: screenshots of the bar, of each bar icon hovered, of the open
// menu for each content language, and of each menu control hovered; plus a box/type dump of the bar and the menu.
// Usage: [OURS=http://localhost:3100] node scripts/parity-reader-bar.mjs [path]   → docs/parity/rbar-*-{live,ours}.png
//        then python3 scripts/parity-diff-page.py rbar-
import { chromium } from "playwright";
const path = process.argv[2] ?? "/Genesis.1";
const OURS = process.env.OURS ?? "http://localhost:3100";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);

const SIDES = {
  live: { origin: "https://www.sefaria.org", bar: ".readerControls", trigger: ".readerOptionsTooltip", menu: ".texts-properties-menu", close: ".readerControls .readerNavMenuCloseButton, .readerControls .closeButton", save: ".readerControls .saveButton" },
  ours: { origin: OURS, bar: "main header", trigger: 'main header [aria-label="Text display options"]', menu: 'main header [role="dialog"]', close: 'main header [aria-label="Close this text"], main header [aria-label="Back to the library"]', save: 'main header [aria-label*="ave"]' },
};

const dump = (sel) => {
  const root = document.querySelector(sel);
  if (!root) return ["(no " + sel + ")"];
  const out = [];
  const walk = (el, d) => {
    const r = el.getBoundingClientRect(), c = getComputedStyle(el);
    if (c.display === "none" || c.visibility === "hidden") return;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 30);
    const tag = el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.split(" ").filter(Boolean).slice(0, 2).join(".") : "");
    if (r.width && r.height) out.push(`${"  ".repeat(Math.min(d, 7))}${tag.slice(0, 44)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}] ${c.fontSize}/${c.lineHeight} ${c.fontWeight} ${c.fontFamily.split(",")[0].replace(/"/g, "")} ${c.color}${c.backgroundColor !== "rgba(0, 0, 0, 0)" ? " bg=" + c.backgroundColor : ""}${c.borderTopWidth !== "0px" ? " bt=" + c.borderTopWidth + " " + c.borderTopColor : ""}${c.borderBottomWidth !== "0px" ? " bb=" + c.borderBottomWidth + " " + c.borderBottomColor : ""}${c.borderRadius !== "0px" ? " r=" + c.borderRadius : ""}${c.boxShadow !== "none" ? " sh=" + c.boxShadow : ""} pad=${c.padding} "${own}"`);
    if (el.tagName.toLowerCase() === "svg" || el.tagName.toLowerCase() === "img") return;
    for (const ch of el.children) walk(ch, d + 1);
  };
  walk(root, 0);
  return out;
};

const shot = async (p, name, side, clip) => p.screenshot({ path: `docs/parity/rbar-${name}-${side}.png`, clip });
for (const [side, s] of Object.entries(SIDES)) {
  const p = await ctx.newPage();
  await p.goto(s.origin + path + "?lang=bi", { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.GuideOverlay,[class*=TextColumnBanner],[class*=translationsBanner],.readerTextBanner").forEach((n) => n.remove()));
  const bar = await p.locator(s.bar).first().boundingBox();
  const barClip = { x: 0, y: bar.y - 4, width: 1280, height: bar.height + 8 };
  console.log(`===== ${side} bar ${JSON.stringify(bar)}`);
  console.log((await p.evaluate(dump, s.bar)).join("\n"));
  await p.mouse.move(5, 890);
  await shot(p, "bar", side, barClip);
  for (const k of ["close", "save", "trigger"]) {
    const l = p.locator(s[k]).filter({ visible: true }).first();
    if (await l.count()) { await l.hover(); await p.waitForTimeout(300); await shot(p, `hover-${k}`, side, barClip); }
  }
  for (const lang of ["bi", "he", "en"]) {
    await p.goto(s.origin + path + `?lang=${lang}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1200);
    await p.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.GuideOverlay,[class*=TextColumnBanner],.readerTextBanner").forEach((n) => n.remove()));
    await p.locator(s.trigger).filter({ visible: true }).first().click();
    await p.waitForTimeout(700);
    const menu = p.locator(s.menu).filter({ visible: true }).first();
    const mb = await menu.boundingBox();
    if (!mb) { console.log(`(${side}: no menu)`); continue; }
    const clip = { x: Math.max(0, mb.x - 20), y: Math.max(0, mb.y - 70), width: mb.width + 40, height: mb.height + 90 };
    await p.mouse.move(5, 890);
    await shot(p, `menu-${lang}`, side, clip);
    if (lang === "bi") {
      console.log(`===== ${side} menu ${JSON.stringify(mb)}`);
      console.log((await p.evaluate((sel) => { const m = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width); m?.setAttribute("data-parity-menu", ""); return true; }, s.menu)) && (await p.evaluate(dump, "[data-parity-menu]")).join("\n"));
      // hover each control in the menu, top to bottom
      const controls = menu.locator(side === "live" ? ".show-source-translation-buttons label, .layout-button label, .toggle-switch-label, .font-size-button" : "[role=radio], button, [role=switch]");
      const n = Math.min(await controls.count(), 16);
      for (let i = 0; i < n; i++) {
        const c = controls.nth(i);
        if (!(await c.isVisible())) continue;
        await c.hover().catch(() => {});
        await p.waitForTimeout(250);
        await shot(p, `menuhover-${String(i).padStart(2, "0")}`, side, clip);
      }
    }
    await p.keyboard.press("Escape");
  }
  await p.close();
}
await b.close();
