import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
for (const [name, url, sel] of [["live", "https://www.sefaria.org/Genesis.1?lang=bi", ".segment .segmentText .he"], ["ours", "http://localhost:3100/Genesis.1?lang=bi", '[role="group"] p span[lang="he"]']]) {
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForSelector(sel); await p.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  console.log(name, JSON.stringify(fonts), await p.locator(sel).first().evaluate((e) => getComputedStyle(e).fontFamily));
  const en = name === "live" ? ".segment .segmentText .en" : '[role="group"] p span[lang="en"]';
  const { nodeId: n2 } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: en });
  console.log("  en", JSON.stringify((await cdp.send("CSS.getPlatformFontsForNode", { nodeId: n2 })).fonts));
}
await b.close();
