import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const live = await ctx.newPage(), ours = await ctx.newPage();
const sq = (t) => t.replace(/\s+/g, "");
for (const q of ["light", "אור", "zzzxqkw"]) {
  await live.goto(`https://www.sefaria.org/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=${encodeURIComponent(q)}`, { waitUntil: "domcontentloaded" });
  await ours.goto(`http://localhost:3100/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=${encodeURIComponent(q)}`, { waitUntil: "domcontentloaded" });
  await live.waitForTimeout(13000); await ours.waitForTimeout(9000);
  const a = sq(await live.locator(".readerPanelBox.sidebar .sidebarSearch").innerText());
  const o = sq(await ours.getByRole("complementary", { name: "Search in this text" }).locator("[data-panel-body]").innerText());
  console.log(a === o ? "SAME" : "DIFF", q, a.length, o.length);
  if (a !== o) { let i = 0; while (a[i] === o[i]) i++; console.log(" live:", a.slice(i - 30, i + 120)); console.log(" ours:", o.slice(i - 30, i + 120)); }
}
await b.close();
