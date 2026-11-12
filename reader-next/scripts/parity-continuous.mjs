// Continuous layout (Talmud): numbers in the gutter at each segment's first line, dots on the other side. Live vs rebuild.
import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const ref = process.argv[2] ?? "/Berakhot.2a?lang=he";
for (const [name, url, seg] of [["live", "https://www.sefaria.org" + ref, ".segment"], ["ours", "http://localhost:3100" + ref, '[role="group"]']]) {
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForSelector(seg); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.cookiesNotification,.readerMessageBox").forEach((n) => n.remove()));
  await p.evaluate((seg) => { const el = document.querySelectorAll(seg)[2]; el.scrollIntoView({ block: "start" }); const sc = [...document.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 50 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.contains(el)); if (sc) sc.scrollTop += el.getBoundingClientRect().top - 120; else scrollBy(0, el.getBoundingClientRect().top - 120); }, seg);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `docs/parity/cont-${name}.png`, clip: { x: 200, y: 100, width: 900, height: 700 } });
}
await b.close();
