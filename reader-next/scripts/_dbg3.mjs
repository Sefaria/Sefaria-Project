import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const p = await ctx.newPage(); await p.goto("http://localhost:3100/Genesis", { waitUntil: "networkidle" }); await p.screenshot({ path: "docs/compare/app-book-genesis-1280.png" });
await b.close();
