// Captures screenshots of the live Sefaria reader for visual reference.
// Usage: node scripts/reference-shots.mjs [name=path ...]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const DEFAULT = {
  "genesis-1-bi": "/Genesis.1?lang=bi",
  "genesis-1-he": "/Genesis.1?lang=he",
  "genesis-1-en": "/Genesis.1?lang=en",
  "genesis-1-sbs": "/Genesis.1?lang=bi&layoutTanakh=heRight",
  "genesis-1-rashi": "/Genesis.1.1?lang=bi&with=Rashi",
  "genesis-1-resources": "/Genesis.1.1?lang=bi&with=all",
  "berakhot-2a": "/Berakhot.2a?lang=bi",
  "berakhot-2a-he": "/Berakhot.2a?lang=he",
  "psalms-23": "/Psalms.23?lang=bi",
  "mishnah-berakhot-1": "/Mishnah_Berakhot.1?lang=bi",
  "rashi-genesis-1": "/Rashi_on_Genesis.1?lang=bi",
  "jastrow": "/Jastrow,_א_I?lang=bi",
  "genesis-toc": "/Genesis",
  "berakhot-toc": "/Berakhot",
  "texts": "/texts",
  "texts-tanakh": "/texts/Tanakh",
  "haggadah-toc": "/Pesach_Haggadah",
};
const args = process.argv.slice(2);
const targets = args.length ? Object.fromEntries(args.map((a) => a.split("="))) : DEFAULT;
const out = new URL("../docs/reference/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "en-US" });
await ctx.addCookies([
  { name: "interfaceLang", value: "english", domain: ".sefaria.org", path: "/" },
  { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" },
]);
const page = await ctx.newPage();
for (const [name, path] of Object.entries(targets)) {
  try {
    await page.goto("https://www.sefaria.org" + path, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1500);
    // dismiss modals / banners that cover content
    await page.evaluate(() => document.querySelectorAll("#interruptingMessageBox, .ReactModalPortal, .cookiesNotification, #bannerMessage, .GuideOverlay").forEach((n) => n.remove()));
    await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
    console.log("ok", name, page.url());
  } catch (e) {
    console.log("fail", name, e.message);
  }
}
await browser.close();
