import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const p = await ctx.newPage();
const clean = () => p.evaluate(() => document.querySelectorAll("#interruptingMessageOverlay, #interruptingMessageBox, #bannerMessage").forEach((e) => e.remove()));
const boxes = () => p.evaluate(() => [...document.querySelectorAll(".readerPanelBox")].map((bx) => { const r = bx.getBoundingClientRect(); return `${Math.round(r.left)}+${Math.round(r.width)}${bx.classList.contains("sidebar") ? " [sidebar]" : ""}`; }).join(" | "));
const show = async (l) => console.log(`\n== ${l}\n   ${decodeURIComponent(p.url().replace("https://www.sefaria.org", ""))}\n   ${await boxes()}`);
await p.goto("https://www.sefaria.org/Genesis.1.1?with=Lexicon&lookup=" + encodeURIComponent("בראשית"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(6000); await clean();
console.log("lexicon DOM:", await p.evaluate(() => { const s = document.querySelector(".readerPanelBox.sidebar"); return s ? [...s.querySelectorAll("[class]")].map((e) => e.className).filter((c) => typeof c === "string" && /entry|lexicon|headword|ref/i.test(c)).slice(0, 25).join(", ") : "no sidebar"; }));
const entry = p.locator(".readerPanelBox.sidebar .entry").first();
if (await entry.count()) { await entry.click(); await p.waitForTimeout(3500); await show("click dictionary entry (.entry)"); }
const cit = p.locator(".readerPanelBox.sidebar a.refLink").first();
await p.goto("https://www.sefaria.org/Genesis.1.1?with=Lexicon&lookup=" + encodeURIComponent("בראשית"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(6000); await clean();
if (await cit.count()) { console.log("lexicon citation:", await cit.getAttribute("data-ref")); await cit.click(); await p.waitForTimeout(3500); await show("click citation inside a dictionary entry"); }
// Compare: find the close / back control
await p.goto("https://www.sefaria.org/Genesis.1.1?with=all", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(5000); await clean();
await p.locator(".toolsButton", { hasText: "Compare Text" }).first().click(); await p.waitForTimeout(3500);
console.log("compare header controls:", await p.evaluate(() => { const bx = document.querySelectorAll(".readerPanelBox")[1]; return [...bx.querySelectorAll("button, a, [role=button], input")].slice(0, 12).map((e) => `${e.tagName}.${e.className}|${e.getAttribute("aria-label") || ""}|${(e.textContent || "").trim().slice(0, 20)}`).join("\n   "); }));
const back = p.locator(".readerPanelBox").nth(1).locator("button, a").first();
await back.click(); await p.waitForTimeout(3500); await show("compare: first control in the compare panel");
await p.goto("https://www.sefaria.org/Genesis.1.1?with=all", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(5000); await clean();
await p.locator(".toolsButton", { hasText: "Compare Text" }).first().click(); await p.waitForTimeout(3500);
await p.locator(".readerPanelBox").nth(1).locator(".readerPanel").first().focus().catch(() => {});
await p.locator(".readerPanelBox").nth(1).click({ position: { x: 200, y: 400 } }).catch(() => {});
await p.keyboard.press("Escape"); await p.waitForTimeout(3000); await show("compare: Escape after focusing the panel");
await b.close();
