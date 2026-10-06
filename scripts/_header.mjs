import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w, h] of [[1280, 800], [390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
  const p = await ctx.newPage();
  await p.goto("https://www.sefaria.org/texts", { waitUntil: "domcontentloaded" }); await p.waitForSelector(".header", { state: "attached", timeout: 20000 }); await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.readerMessageBox").forEach((n) => n.remove()));
  console.log("=====", w, await p.evaluate(() => {
    const hd = document.querySelector(".header"); const r = hd.getBoundingClientRect();
    return JSON.stringify({ rect: [r.top|0, r.height|0], cls: hd.className, html: hd.innerHTML.replace(/\s+/g, " ").slice(0, 3800) });
  }));
  await p.screenshot({ path: `docs/reference/header-${w}.png`, clip: { x: 0, y: 0, width: w, height: 160 } });
  await ctx.close();
}
await b.close();
