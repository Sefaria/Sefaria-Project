import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const p = await ctx.newPage();
for (const w of ["Share", "Feedback"]) {
  await p.goto(`https://www.sefaria.org/Genesis.1.1?lang=en&with=all`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  await p.evaluate(() => { document.querySelector("#interruptingMessageOverlay")?.remove(); document.querySelector("#interruptingMessageBox")?.remove(); });
  const side = p.locator(".readerPanelBox.sidebar");
  await side.getByText(w, { exact: true }).first().click();
  await p.waitForTimeout(1500);
  console.log("=====", w, decodeURIComponent(p.url()), "\n" + (await side.innerText()));
  console.log((await side.locator("input,textarea,select,button,a").evaluateAll(e => e.map(x => `${x.tagName}[${x.type||""}] ph=${x.getAttribute("placeholder")||""} ${x.getAttribute("href")||""} ${x.value||x.textContent.trim().slice(0,30)}`))).join("\n"));
  if (w==="Feedback") console.log("OPTIONS", await side.locator("select option").evaluateAll(o=>o.map(x=>x.value+"="+x.textContent)));
}
await b.close();
