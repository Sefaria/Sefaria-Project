import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext();
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const p = await ctx.newPage(); const posts = [];
p.on("request", r => r.method()==="POST" && r.url().includes("search-wrapper") && posts.push(r.postData()));
await p.goto("https://www.sefaria.org/Genesis.1.1?lang=en&with=SidebarSearch&sbsq=" + encodeURIComponent("אור"), { waitUntil: "domcontentloaded" });
await p.waitForTimeout(12000);
console.log(posts, JSON.stringify((await p.locator(".readerPanelBox.sidebar").innerText()).slice(0,120)), await p.locator("#searchQueryInput").inputValue());
await b.close();
