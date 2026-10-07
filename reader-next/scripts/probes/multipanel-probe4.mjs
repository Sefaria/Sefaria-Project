// What a connected text's title does in the sidebar, and a source version's "Open" from About (desktop).
import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const p = await ctx.newPage();
const clean = () => p.evaluate(() => document.querySelectorAll("#interruptingMessageOverlay, #interruptingMessageBox, #bannerMessage").forEach((e) => e.remove()));
const boxes = () => p.evaluate(() => [...document.querySelectorAll(".readerPanelBox")].map((bx) => { const r = bx.getBoundingClientRect(); return `${Math.round(r.left)}+${Math.round(r.width)}${bx.classList.contains("sidebar") ? "s" : ""}`; }).join(" "));
const show = async (l) => console.log(`== ${l}\n   ${decodeURIComponent(p.url().replace("https://www.sefaria.org", ""))}\n   ${await boxes()}`);
const go = async (u) => { await p.goto("https://www.sefaria.org" + u, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(5000); await clean(); };
await go("/Genesis.1.1?with=Commentary&lang2=en");
console.log("title elements:", await p.evaluate(() => [...document.querySelectorAll(".readerPanelBox.sidebar .textListTextRangeBox")].slice(0, 1).map((x) => x.innerHTML.slice(0, 600)).join("")));
console.log("candidates:", await p.evaluate(() => [...document.querySelectorAll(".readerPanelBox.sidebar .textListTextRangeBox")].slice(0, 2).map((x) => [...x.querySelectorAll("a, .title, .titleBox, h3, h4")].map((e) => e.tagName + "." + e.className + ":" + (e.getAttribute("href") || "") + ":" + e.textContent.trim().slice(0, 30)).join(" | ")).join("\n")));
const title = p.locator(".readerPanelBox.sidebar .textListTextRangeBox .title, .readerPanelBox.sidebar .textListTextRangeBox .titleBox").first();
console.log("title count", await title.count());
if (await title.count()) { await title.click(); await p.waitForTimeout(3500); await show("click connected text title"); }
await go("/Genesis.1.1?with=About&lang2=en");
const vtitles = p.locator(".readerPanelBox.sidebar .versionBlock .versionTitle a, .readerPanelBox.sidebar a.versionTitle");
console.log("about version titles", await vtitles.count());
await b.close();
