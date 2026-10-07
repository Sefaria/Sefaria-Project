import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const live = await ctx.newPage(), ours = await ctx.newPage();
await live.goto("https://www.sefaria.org/Zohar,_Introduction.1.1?lang=en&with=Navigation", { waitUntil: "domcontentloaded" });
await live.waitForSelector(".readerPanelBox.sidebar .textTableOfContents", { timeout: 20000 });
await live.evaluate(() => [...document.querySelectorAll(".altStructToggle")].find((a) => a.textContent.trim() === "Essay").click());
await ours.goto("http://localhost:3100/Zohar,_Introduction.1.1?lang=en&with=Navigation", { waitUntil: "domcontentloaded" });
const side = ours.getByRole("complementary", { name: "Table of Contents" });
await side.getByRole("radio", { name: "Essay" }).click({ timeout: 20000 });
await live.waitForTimeout(800);
const sq = (t) => t.replace(/\s+/g, "");
const a = sq(await live.locator(".readerPanelBox.sidebar .textTableOfContents").innerText());
const o = sq(await side.locator("[data-panel-body]").innerText());
console.log(a === o ? "SAME" : "DIFF", a.length, o.length);
if (a !== o) { console.log(a.slice(0, 200)); console.log(o.slice(0, 200)); }
await b.close();
