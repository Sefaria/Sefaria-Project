// Search page parity: live sefaria.org vs the rebuild, for a few queries and every tab.
//   node scripts/parity-search.mjs [--mobile] [q:tab[:tvar] ...]      e.g. "light:sources" "אור:books" "אור:sources:0"
// Known differences: (1) Authors/Topics cards on sefaria.org carry a parent-topic crumb ("Authors", "Nature") that needs the
// topic TOC, which the site only embeds in its pages; (2) Hebrew queries with "All Results" also merge Dicta's Tanakh index
// on sefaria.org (SRC-082) — the Hebrew case here therefore uses Exact Phrase (tvar=0).
// Compares tab labels, the toolbar, the result cards (first 8) and the filters, as squashed text. Counts can drift a
// little on the live site from run to run; the text should not.
import { chromium } from "playwright";
const args = process.argv.slice(2);
const mobile = args.includes("--mobile");
const cases = args.filter((a) => a.includes(":")).map((a) => { const [q, tab, tvar, ...rest] = a.split(":"); return [q, tab, tvar, rest.join(":")]; });
const list = cases.length ? cases : [["light", "sources"], ["light", "books"], ["light", "authors"], ["light", "topics"], ["אור", "sources", "0"], ["rashi", "books"], ["zzzxqkw", "sources"], ['רש"י', "authors"]];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile, ...(mobile ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" } : {}) });
// (the live site decides single-panel mode from the User-Agent too, so a phone needs a phone UA)
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: "localhost", path: "/" }]);
const live = await ctx.newPage(), ours = await ctx.newPage();
const sq = (t) => t.replace(/\s+/g, "");
const clean = (t) => t.replace(/Ask the Library Assistant[\s\S]*?Maybe later/, "").replace(/We use cookies[\s\S]*?OK/, "");
const tabsOf = (t) => (t.match(/Sources\s*[\d,+]*\s*Books\s*[\d,+]*\s*Authors\s*[\d,+]*\s*Topics\s*[\d,+]*/) ?? [""])[0];
const after = (t, from, n) => { const i = t.indexOf(from); return i < 0 ? "" : t.slice(i + from.length, i + from.length + n); };
let bad = 0;
for (const [q, tab, tvar = "1", extra = ""] of list) {
  // optional 4th part: more parameters, e.g. "tsort=chronological&tpathFilters=Tanakh"
  const qs = `q=${encodeURIComponent(q)}&tab=text&search_tab=${tab}&tvar=${tvar}${extra.includes("tsort=") ? "" : "&tsort=relevance"}${extra ? "&" + extra : ""}`;
  await live.goto(`https://www.sefaria.org/search?${qs}`, { waitUntil: "networkidle" });
  await live.evaluate(() => { document.querySelector("#interruptingMessageOverlay")?.remove(); document.querySelector("#interruptingMessageBox")?.remove(); });
  await ours.goto(`http://localhost:3100/search?${qs}`, { waitUntil: "networkidle" });
  await live.waitForTimeout(1500); await ours.waitForTimeout(1500);
  const a = clean(await live.locator("body").innerText()), o = clean(await ours.locator("body").innerText());
  // The part from the tab strip on, without the filters panel (compared on its own below)
  const cut = (t) => { const i = t.indexOf("Sources"); return i < 0 ? t : t.slice(i); };
  const body = (t) => sq(cut(t).split(/\nFilters\n/)[0]).slice(0, 2500);
  const filters = (t) => sq(after(t, "\nFilters\n", 700)).split("AboutHelpContactUs")[0];
  const parts = { tabs: [sq(tabsOf(a)), sq(tabsOf(o))], body: [body(a), body(o)], filters: mobile ? ["", ""] : [filters(a), filters(o)] };
  for (const [name, [x, y]] of Object.entries(parts)) {
    const same = x === y;
    if (!same) bad++;
    console.log(same ? "SAME" : "DIFF", name.padEnd(8), `${q} / ${tab}`, x.length, y.length);
    if (!same) { let i = 0; while (x[i] === y[i]) i++; console.log("   live:", x.slice(Math.max(0, i - 40), i + 100)); console.log("   ours:", y.slice(Math.max(0, i - 40), i + 100)); }
  }
}
await b.close();
console.log(bad ? `${bad} differ` : "all same");
