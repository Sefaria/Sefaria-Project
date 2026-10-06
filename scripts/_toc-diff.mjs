import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1400, height: 1100 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }]);
const live = await ctx.newPage(), ours = await ctx.newPage();
const norm = (t) => [t.replace(/\s+/g, "")];
let bad = 0;
for (const ref of ["Genesis.2.5", "Berakhot.5b.3", "Mishneh_Torah,_Foundations_of_the_Torah.1.1", "Pesach_Haggadah,_Kadesh", "Zohar,_Introduction.1.1", "Jastrow,_א.1"]) {
  await live.goto(`https://www.sefaria.org/${ref}?lang=en&with=Navigation`, { waitUntil: "domcontentloaded" });
  await ours.goto(`http://localhost:3100/${ref}?lang=en&with=Navigation`, { waitUntil: "domcontentloaded" });
  await live.waitForSelector(".readerPanelBox.sidebar .tocContent, .readerPanelBox.sidebar .textTableOfContents", { timeout: 20000 }).catch(() => {});
  await ours.getByRole("complementary", { name: "Table of Contents" }).locator("a").first().waitFor({ timeout: 20000 }).catch(() => {});
  await live.waitForTimeout(1500);
  const a = norm(await live.locator(".readerPanelBox.sidebar .textTableOfContents").innerText().catch(() => ""));
  const o = norm(await ours.getByRole("complementary", { name: "Table of Contents" }).locator("[data-panel-body]").innerText().catch(() => ""));
  const lc = (await live.locator(".readerPanelBox.sidebar .current").evaluateAll((e) => e.map((x) => x.textContent.trim()))).join(";");
  const oc = (await ours.getByRole("complementary", { name: "Table of Contents" }).locator("[data-current]").evaluateAll((e) => e.map((x) => x.textContent.trim()))).join(";");
  if (lc !== oc) console.log(" current live:", lc, "ours:", oc);
  const same = JSON.stringify(a) === JSON.stringify(o) && lc === oc;
  if (!same) bad++;
  console.log(same ? "SAME " : "DIFF ", ref, a.length, o.length);
  if (!same) { console.log(" live:", a.slice(0, 30).join(" | ")); console.log(" ours:", o.slice(0, 30).join(" | ")); }
}
await b.close(); process.exit(bad ? 1 : 0);
