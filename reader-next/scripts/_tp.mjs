import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const p = await ctx.newPage(); const reqs = [];
p.on("request", r => r.url().includes("/api/") && !/sentry|strapi|background|links|texts|related\/|index/.test(r.url()) && reqs.push(decodeURIComponent(r.url()).slice(25, 170)));
for (const path of ["/Genesis.1.1?lang=en&with=Topics", "/Berakhot.2a.1?lang=en&with=Topics"]) {
  reqs.length = 0;
  await p.goto("https://www.sefaria.org" + path, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(7000);
  const side = p.locator(".readerPanelBox.sidebar");
  console.log("=====", path, "→", decodeURIComponent(new URL(p.url()).search)); console.log((await side.innerText()).slice(0, 1100)); console.log("REQS", reqs.join("\n  "));
  if (path.startsWith("/Genesis")) await side.screenshot({ path: "/private/tmp/claude-501/-Users-akiva-Sefaria-dev-Sefaria-Project/ce92a779-5c0e-43e0-a3bd-e33a1b4d1619/scratchpad/live-topics.png" });
}
await b.close();
