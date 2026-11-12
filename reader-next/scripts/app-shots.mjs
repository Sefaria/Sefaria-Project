// Screenshots the running app (dev server on :3100) for comparison with docs/reference/*.png.
// Usage: node scripts/app-shots.mjs name=/Path?query [...]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const targets = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf("="); return [a.slice(0, i), a.slice(i + 1)]; }));
const out = new URL("../docs/compare/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
for (const [name, path] of Object.entries(targets)) {
  await page.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: new URL(`app-${name}.png`, out).pathname });
  console.log("ok", name);
}
if (errors.length) console.log("CONSOLE ERRORS:\n" + [...new Set(errors)].join("\n"));
await browser.close();
