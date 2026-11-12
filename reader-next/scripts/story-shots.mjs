// Screenshots Storybook stories for visual comparison with docs/reference/*.png (the live reader).
// Usage: node scripts/story-shots.mjs <story-id> [<story-id> ...]   (Storybook must be running on :6006)
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const ids = process.argv.slice(2);
const out = new URL("../docs/compare/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
for (const id of ids) {
  await page.goto(`http://localhost:6006/iframe.html?id=${id}&viewMode=story&globals=interfaceLang:english;theme:light`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: new URL(`${id}.png`, out).pathname });
  console.log("ok", id);
}
await browser.close();
