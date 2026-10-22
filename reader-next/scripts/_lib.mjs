import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const p = await ctx.newPage(); const reqs = [];
p.on("request", (r) => /\/api\//.test(r.url()) && !/sentry|strapi|background-data|calendars|links|related/.test(r.url()) && reqs.push(r.method() + " " + decodeURIComponent(r.url()).slice(24, 130)));
for (const path of process.argv.slice(2)) {
  reqs.length = 0;
  await p.goto("https://www.sefaria.org" + path, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4500);
  await p.evaluate(() => document.querySelectorAll("#interruptingMessageBox,#interruptingMessageOverlay,.readerMessageBox").forEach((n) => n.remove()));
  console.log("=====", path, "→", p.url().replace("https://www.sefaria.org", ""), "\nREQS", reqs.join(" || "));
  const main = await p.locator(".content, .readerNavMenu, .navBlock").first().innerText().catch(() => "");
  console.log(main.split("\n").filter(Boolean).slice(0, 45).join(" | ").slice(0, 1800));
  await p.screenshot({ path: `docs/reference/lib-${path.replace(/[^a-z]/gi, "_")}.png` });
}
await b.close();
