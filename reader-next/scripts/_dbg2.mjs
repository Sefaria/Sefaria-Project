import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto("http://localhost:3100/Berakhot.2a?lang=he", { waitUntil: "domcontentloaded" }); await p.waitForSelector('[role="group"]'); await p.waitForTimeout(2500);
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[role="group"]')].slice(0, 14).map((s) => { const n = s.querySelector("[data-number]"), r = n.getBoundingClientRect(), c = getComputedStyle(n); return `${n.textContent}@x${Math.round(r.left)},y${Math.round(r.top)} vis=${c.visibility} pos=${c.position} top=${c.top}`; }))));
await b.close();
