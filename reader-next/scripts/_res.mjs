import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const p = await ctx.newPage(); const reqs = [];
p.on("request", r => r.url().includes("/api/") && !/sentry|strapi|background|links|texts|related\/Gen|index|versions/.test(r.url()) && reqs.push(decodeURIComponent(r.url()).slice(25, 170)));
for (const [mode, ref] of [["WebPages", "Genesis.1.1"], ["manuscripts", "Genesis.1.1"], ["Torah Readings", "Genesis.1.1"], ["WebPages", "Berakhot.2a.1"]]) {
  reqs.length = 0;
  await p.goto("https://www.sefaria.org/" + ref + "?lang=en&with=" + encodeURIComponent(mode), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(7000);
  const side = p.locator(".readerPanelBox.sidebar");
  console.log("=====", mode, ref, "→", decodeURIComponent(new URL(p.url()).search)); console.log((await side.innerText()).slice(0, 900)); console.log("REQS", reqs.join("\n  "));
  await side.screenshot({ path: "/private/tmp/claude-501/-Users-akiva-Sefaria-dev-Sefaria-Project/ce92a779-5c0e-43e0-a3bd-e33a1b4d1619/scratchpad/live-" + mode.replace(" ", "") + ".png" });
}
await b.close();
