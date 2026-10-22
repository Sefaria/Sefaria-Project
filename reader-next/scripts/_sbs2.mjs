import { chromium } from "playwright";
const b = await chromium.launch();
for (const lang of ["english", "hebrew"]) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addCookies([{ name: "interfaceLang", value: lang, domain: "www.sefaria.org", path: "/" }]);
  const p = await ctx.newPage();
  const posts = [];
  p.on("request", (r) => { if (r.method() === "POST" && r.url().includes("search-wrapper")) { const d = JSON.parse(r.postData()); posts.push(`${d.query} filters=${JSON.stringify(d.filters)} start=${d.start} size=${d.size}`); } });
  await p.goto("https://www.sefaria.org/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=zzzxqkw", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => document.querySelector("#interruptingMessageOverlay")?.remove());
  await p.waitForTimeout(6000);
  const side = p.locator(".readerPanelBox.sidebar");
  console.log(lang, "EMPTY:", JSON.stringify((await side.innerText()).slice(0, 200)), "placeholder:", await side.locator("#searchQueryInput").getAttribute("placeholder"), "title:", await side.locator("#searchQueryInput").getAttribute("title"));
  await side.locator("#searchQueryInput").fill("אור");
  await side.locator("#searchQueryInput").press("Enter");
  await p.waitForTimeout(7000);
  console.log(lang, "URL", decodeURIComponent(p.url()));
  console.log(lang, "HE:", (await side.innerText()).split("\n").filter(Boolean).slice(0, 14).join(" | ").slice(0, 700));
  // scroll for next page
  await side.locator(".content, .sidebarSearch").first().evaluate((e) => { let n = e; while (n && n.scrollHeight <= n.clientHeight + 5) n = n.parentElement; n.scrollTop = n.scrollHeight; }).catch(() => {});
  await p.waitForTimeout(3000);
  console.log(lang, "POSTS", posts);
  await ctx.close();
}
await b.close();
