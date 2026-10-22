import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
for (const [n, path] of [["texts", "/texts"], ["torah", "/texts/Tanakh/Torah"], ["tanakh", "/texts/Tanakh"]]) { await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" }); await p.waitForTimeout(500); await p.screenshot({ path: `docs/compare/app-lib-${n}.png` }); }
await b.close();
