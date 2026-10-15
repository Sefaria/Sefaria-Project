// Book page parity: the main column's text (title, category, button, tabs, contents) live vs rebuild, and the sidebar's.
import { chromium } from "playwright";
const books = process.argv.slice(2).length ? process.argv.slice(2) : ["Genesis", "Berakhot", "Pesach_Haggadah", "Rashi_on_Genesis", "Mishneh_Torah,_Foundations_of_the_Torah", "Zohar", "Jastrow", "Pirkei_Avot", "Kuzari"];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const live = await ctx.newPage(), ours = await ctx.newPage();
const sq = (t) => t.replace(/\s+/g, "");
let bad = 0;
for (const bk of books) {
  await live.goto(`https://www.sefaria.org/${bk}`, { waitUntil: "domcontentloaded" }); await live.waitForSelector(".bookPage .contentInner", { timeout: 25000 }).catch(() => {});
  await ours.goto(`http://localhost:3100/${bk}`, { waitUntil: "domcontentloaded" }); await ours.waitForSelector("main article h1", { timeout: 25000 }).catch(() => {});
  await live.waitForTimeout(2500); await ours.waitForTimeout(800);
  const a = sq(await live.locator(".bookPage .contentInner").innerText().catch(() => ""));
  const o = sq(await ours.locator("main article").innerText().catch(() => ""));
  const same = a === o;
  if (!same) bad++;
  console.log(same ? "SAME" : "DIFF", bk, a.length, o.length);
  if (!same) { let i = 0; while (a[i] === o[i]) i++; console.log("  live:", a.slice(Math.max(0, i - 30), i + 120)); console.log("  ours:", o.slice(Math.max(0, i - 30), i + 120)); }
}
await b.close();
console.log(bad ? `${bad} differ` : "all same");
