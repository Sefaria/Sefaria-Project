import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const p = await ctx.newPage();
for (const w of ["Notes", "Add To Sheet", "Advanced Tools"]) {
  await p.goto(`https://www.sefaria.org/Genesis.1.1?lang=en&with=all`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { document.querySelector("#interruptingMessageOverlay")?.remove(); document.querySelector("#interruptingMessageBox")?.remove(); });
  const label = { "Notes": "Notes", "Add To Sheet": "Add to Sheet", "Advanced Tools": "Advanced" }[w];
  await p.locator(".readerPanelBox.sidebar").getByText(label, { exact: true }).first().click();
  await p.waitForTimeout(1500);
  console.log("=====", w, decodeURIComponent(p.url()));
  console.log((await p.locator(".readerPanelBox.sidebar").innerText()).slice(0, 400));
  const modal = await p.locator(".sefariaModalBox, #interruptingMessage, [class*=modal]").first().innerText().catch(() => "");
  console.log("MODAL:", modal.slice(0, 500));
}
await b.close();
