// Library pages parity: the main column and the sidebar's text, live vs rebuild.
import { chromium } from "playwright";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/texts", "/texts/Tanakh", "/texts/Tanakh/Torah", "/texts/Tanakh/Commentary", "/texts/Mishnah", "/texts/Talmud", "/texts/Talmud/Yerushalmi", "/texts/Tosefta", "/texts/Halakhah/Mishneh Torah", "/texts/Liturgy", "/texts/Kabbalah", "/texts/Jewish Thought", "/texts/Responsa", "/texts/Reference"];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const live = await ctx.newPage(), ours = await ctx.newPage();
const sq = (t) => t.replace(/\s+/g, "");
let bad = 0;
for (const path of paths) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  await live.goto(`https://www.sefaria.org${enc}`, { waitUntil: "domcontentloaded" }); await live.waitForSelector(".readerNavMenu .contentInner", { timeout: 25000 }).catch(() => {});
  await ours.goto(`http://localhost:3100${enc}`, { waitUntil: "domcontentloaded" }); await ours.waitForSelector("main h1", { timeout: 25000 }).catch(() => {});
  await live.waitForTimeout(2000); await ours.waitForTimeout(500);
  const a = sq(await live.locator(".readerNavMenu .contentInner").innerText().catch(() => ""));
  const o = sq(await ours.locator("main > div > div:first-child").innerText().catch(() => ""));
  const sa = sq((await live.locator(".navSidebar").innerText().catch(() => "")).replace(/Live Webinar[\s\S]*?Register/, ""));
  const so = sq(await ours.locator("main aside").innerText().catch(() => ""));
  const mainSame = a === o, sideSame = sa === so;
  if (!mainSame || !sideSame) bad++;
  console.log(mainSame ? "SAME" : "DIFF", sideSame ? "side=SAME" : "side=DIFF", path, a.length, o.length, "|", sa.length, so.length);
  if (!mainSame) { let i = 0; while (a[i] === o[i]) i++; console.log("   main live:", a.slice(Math.max(0, i - 40), i + 110)); console.log("   main ours:", o.slice(Math.max(0, i - 40), i + 110)); }
  if (!sideSame) { let i = 0; while (sa[i] === so[i]) i++; console.log("   side live:", sa.slice(Math.max(0, i - 40), i + 110)); console.log("   side ours:", so.slice(Math.max(0, i - 40), i + 110)); }
}
await b.close();
console.log(bad ? `${bad} differ` : "all same");
