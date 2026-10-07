// Records sefaria.org's multi-panel behaviour: panels on screen and the URL after each sidebar action (desktop, 1440x900).
import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const p = await ctx.newPage();
const clean = () => p.evaluate(() => document.querySelectorAll("#interruptingMessageOverlay, #interruptingMessageBox, .modal, #bannerMessage").forEach((e) => e.remove()));
const state = async (label) => {
  const s = await p.evaluate(() => [...document.querySelectorAll(".readerPanelBox")].map((b) => {
    const r = b.getBoundingClientRect(); const panel = b.querySelector(".readerPanel");
    return `${Math.round(r.left)}+${Math.round(r.width)} ${panel?.className.replace(/\s+/g, " ").slice(0, 60)} | ${(b.querySelector(".readerTextTableOfContents, .connectionsPanelHeader .connectionsHeaderTitle, .readerControls .readerTextToc, h1")?.textContent || "").trim().slice(0, 50)}`;
  }));
  console.log(`\n== ${label}\nURL ${decodeURIComponent(p.url().replace("https://www.sefaria.org", ""))}\n  ` + s.join("\n  "));
};
const go = async (url) => { await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4000); await clean(); };
const click = async (label, loc) => { try { await loc.first().click({ timeout: 8000 }); await p.waitForTimeout(3000); await clean(); await state(label); } catch (e) { console.log(`\n== ${label}: FAILED ${String(e).slice(0, 160)}`); } };

await go("https://www.sefaria.org/Genesis.1"); await state("open Genesis 1");
await click("click verse 1 (sidebar)", p.locator(".segment[data-ref='Genesis 1:1']"));
await click("click Commentary category", p.locator(".connectionsPanel .categoryFilter", { hasText: "Commentary" }));
await click("click Rashi", p.locator(".connectionsPanel .textFilter", { hasText: "Rashi" }));
await click("click the Rashi comment text", p.locator(".connectionsPanel .textRange .segment, .connectionsPanel .textListTextRangeBox .segment"));
await go("https://www.sefaria.org/Genesis.1.1?with=Rashi");
await state("deep link with=Rashi");
await click("click 'Open' on first Rashi", p.locator(".connectionsPanel a", { hasText: /^Open$/ }));
await go("https://www.sefaria.org/Genesis.1.1?with=all");
await click("Compare Text tool", p.locator(".connectionsPanel .toolsButton", { hasText: "Compare Text" }));
await go("https://www.sefaria.org/Genesis.1.1?with=Translations");
await click("Translations: open a version title", p.locator(".connectionsPanel .versionBlock .versionTitle a, .connectionsPanel .versionBlock a.versionTitle"));
await go("https://www.sefaria.org/Genesis.1");
await click("citation in text? (none in Genesis) — use Rashi on Genesis 1:1 page", p.locator("body"));
await go("https://www.sefaria.org/Rashi_on_Genesis.1.1");
await state("open Rashi on Genesis 1:1 directly");
console.log("\nPAGE URL forms with multiple panels seen above. Done.");
await b.close();
