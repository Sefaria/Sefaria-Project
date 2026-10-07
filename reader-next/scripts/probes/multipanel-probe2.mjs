// Live URL / layout facts for the multi-panel plan (Step 0). Desktop 1440x900. Prints the URL and the panel boxes after each action.
import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const p = await ctx.newPage();
const clean = () => p.evaluate(() => document.querySelectorAll("#interruptingMessageOverlay, #interruptingMessageBox, #bannerMessage").forEach((e) => e.remove()));
const state = async (label) => {
  const s = await p.evaluate(() => [...document.querySelectorAll(".readerPanelBox")].map((bx) => {
    const r = bx.getBoundingClientRect(); const side = bx.classList.contains("sidebar");
    const t = (bx.querySelector(".readerTextToc .readerTextTocBox, .connectionsHeaderTitle, .readerControls h1, .readerNavMenu h1, h1, h2")?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${Math.round(r.left)}+${Math.round(r.width)}${side ? " [sidebar]" : ""} ${t}`;
  }));
  console.log(`\n== ${label}\n   ${decodeURIComponent(p.url().replace("https://www.sefaria.org", ""))}\n   ` + s.join("\n   "));
};
const go = async (url) => { await p.goto("https://www.sefaria.org" + url, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(4500); await clean(); };
const act = async (label, fn) => { try { await fn(); await p.waitForTimeout(3000); await clean(); await state(label); } catch (e) { console.log(`\n== ${label}: FAILED ${String(e).split("\n")[0].slice(0, 200)}`); } };
const seg = (panelIdx, ref) => p.locator(".readerPanelBox").nth(panelIdx).locator(`.segment[data-ref='${ref}']`).first();

// 1. [A, B] then a sidebar on A, then on B
await go("/Genesis.1?p2=Exodus.1"); await state("[A, B] from URL");
await act("verse in A → sidebar between", () => seg(0, "Genesis 1:1").click());
await go("/Genesis.1?p2=Exodus.1"); await act("verse in B → sidebar after B", () => seg(1, "Exodus 1:1").click());
// 2. a citation in the text: find a page with refLinks in the main text
for (const page of ["/Ramban_on_Genesis.1.1", "/Mishneh_Torah,_Repentance.1.1", "/Kitzur_Shulchan_Arukh.1.1"]) {
  await go(page);
  const n = await p.locator(".readerPanelBox").first().locator("a.refLink").count();
  console.log(`\n-- ${page}: ${n} citation links`);
  if (!n) continue;
  const href = await p.locator(".readerPanelBox").first().locator("a.refLink").first().getAttribute("data-ref");
  await act(`citation '${href}' in [A]`, () => p.locator(".readerPanelBox").first().locator("a.refLink").first().click());
  await act(`another citation in A while [A, Cit]`, () => p.locator(".readerPanelBox").first().locator("a.refLink").nth(1).click());
  await go(page + "?p2=Exodus.1"); await state(`[A, B] ${page}`);
  await act("citation in A while [A, B] (B a reader-opened text)", () => p.locator(".readerPanelBox").first().locator("a.refLink").first().click());
  break;
}
// 3. Compare Text browsing
await go("/Genesis.1.1?with=all");
await act("Compare Text", () => p.locator(".toolsButton", { hasText: "Compare Text" }).first().click());
await act("compare: Tanakh", () => p.locator(".readerPanelBox").nth(1).getByText("Tanakh", { exact: true }).first().click());
await act("compare: Exodus", () => p.locator(".readerPanelBox").nth(1).getByText("Exodus", { exact: true }).first().click());
await act("compare: chapter 2", () => p.locator(".readerPanelBox").nth(1).locator("a.sectionLink", { hasText: /^2$/ }).first().click());
await go("/Genesis.1.1?with=all");
await act("Compare Text again", () => p.locator(".toolsButton", { hasText: "Compare Text" }).first().click());
await act("compare: back/close button", () => p.locator(".readerPanelBox").nth(1).locator(".readerNavMenuCloseButton, .comparePanelHeader button, .comparePanelHeader a, [aria-label*='Back' i], [aria-label*='Close' i]").first().click());
await go("/Genesis.1.1?with=all");
await act("Compare Text then Escape", async () => { await p.locator(".toolsButton", { hasText: "Compare Text" }).first().click(); await p.waitForTimeout(2500); await p.keyboard.press("Escape"); });
// 4. Dictionary entry (Lexicon)
await go("/Genesis.1.1?with=Lexicon&lookup=" + encodeURIComponent("בראשית")); await state("lexicon lookup");
await act("click dictionary entry headword", () => p.locator(".readerPanelBox.sidebar .entry .headword, .readerPanelBox.sidebar .lexicon-content .headword, .readerPanelBox.sidebar .entry").first().click());
// 5. A translation's Open
await go("/Genesis.1.1?with=Translations"); await state("translations");
await act("translation: open preview (title)", () => p.locator(".readerPanelBox.sidebar .versionBlock .versionTitle a, .readerPanelBox.sidebar a.versionTitle, .readerPanelBox.sidebar .versionPreviewWithOptionalEllipsis").nth(1).click());
await act("translation: Open Text", () => p.locator(".readerPanelBox.sidebar").getByText(/^Open Text$|^Open$/).first().click());
await b.close();
