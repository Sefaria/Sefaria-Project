import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const p = await ctx.newPage(); const reqs = [];
p.on("request", r => r.url().includes("/api/") && !/sentry|strapi|background|links|texts\/|related|versions/.test(r.url()) && reqs.push(decodeURIComponent(r.url()).slice(25, 150)));
for (const [ref, tag] of [["Genesis.2.5", "genesis"], ["Berakhot.5b.3", "berakhot"], ["Mishneh_Torah,_Foundations_of_the_Torah.1.1", "mt"], ["Pesach_Haggadah,_Kadesh", "haggadah"]]) {
  reqs.length = 0;
  await p.goto("https://www.sefaria.org/" + ref + "?lang=en&with=Navigation", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(7000);
  const side = p.locator(".readerPanelBox.sidebar");
  const txt = await side.innerText();
  console.log("=====", ref, "→", decodeURIComponent(new URL(p.url()).search), "\n" + txt.split("\n").filter(Boolean).slice(0, 40).join(" | ").slice(0, 1100));
  console.log("   current:", await side.locator(".current").evaluateAll(els => els.map(e => e.textContent.trim().slice(0, 30)).join(" ; ")));
  console.log("REQS", reqs.join(" || "));
  await side.screenshot({ path: "/private/tmp/claude-501/-Users-akiva-Sefaria-dev-Sefaria-Project/ce92a779-5c0e-43e0-a3bd-e33a1b4d1619/scratchpad/live-toc-" + tag + ".png" });
}
await b.close();
