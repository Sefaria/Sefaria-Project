import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w, h] of [[1280, 900], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
  const p = await ctx.newPage();
  await p.goto("https://www.sefaria.org/Genesis", { waitUntil: "domcontentloaded" }); await p.waitForSelector(".bookPage", { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(3000);
  await p.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.readerMessageBox").forEach((n) => n.remove()));
  console.log("=====", w, p.url());
  console.log((await p.locator("body").innerText()).split("\n").filter(Boolean).slice(0, 60).join(" | ").slice(0, 2400));
  await p.screenshot({ path: `docs/reference/book-genesis-${w}.png`, fullPage: false });
  await ctx.close();
}
await b.close();
