import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const p = await ctx.newPage();
for (const path of process.argv.slice(2)) {
  await p.goto("https://www.sefaria.org" + path, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4500);
  console.log("=====", path);
  console.log("SIDEBAR:", (await p.locator(".navSidebar").innerText().catch(() => "none")).split("\n").filter(Boolean).join(" | "));
  console.log("SIDEBAR LINKS:", JSON.stringify(await p.locator(".navSidebar a").evaluateAll((a) => a.map((x) => [x.textContent.trim().slice(0, 40), x.getAttribute("href")]))));
  console.log("MAIN LINKS:", JSON.stringify(await p.locator(".content a, .navBlock a").evaluateAll((a) => a.slice(0, 6).map((x) => [x.textContent.trim().slice(0, 30), x.getAttribute("href")]))));
}
await b.close();
