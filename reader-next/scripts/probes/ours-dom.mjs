import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
await p.goto("http://localhost:3100/Genesis.1.1?with=Rashi"); await p.waitForSelector("html[data-hydrated='true']"); await p.waitForTimeout(5000);
console.log(await p.evaluate(() => [...document.querySelectorAll("[data-panel-id]")].map((s) => { const r = s.getBoundingClientRect(); return `panel ${s.dataset.panelId} ${Math.round(r.left)}+${Math.round(r.width)} aside=${s.dataset.hasAside} children:` + [...s.querySelectorAll("[data-leaf], [data-split-leaf], section > div > div")].slice(0, 4).map((c) => `${c.tagName}.${(c.className || "").toString().slice(0, 30)}${JSON.stringify(c.dataset)} ${Math.round(c.getBoundingClientRect().left)}+${Math.round(c.getBoundingClientRect().width)}`).join(" ; "); }).join("\n")));
const snap = await p.locator("[data-has-aside='true']").first().ariaSnapshot();
console.log(snap.split("\n").filter((l) => /link|button|heading/.test(l)).slice(0, 40).join("\n"));
await b.close();
