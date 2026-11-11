// Ref corpus parity: for each address in scripts/ref-corpus.cases.mjs, where www.sefaria.org lands (the
// final address, after its redirects and its client's own rewrites) and which segments it highlights, against the same on this reader.
// Read-only on www.sefaria.org (page loads, with the interfaceLang=english cookie).
//
//   node scripts/ref-corpus.mjs [--local http://localhost:3370] [--only <substring>] [--out <file.json>] [--expected]
//
// The local reader should run against the live API (`PORT=3370 npm run dev`, or a production build: `node server/index.mjs`), so both
// sides see the same data. --expected rewrites scripts/ref-corpus.expected.json from the live side for the cases marked equal, which
// e2e/ref-corpus.spec.ts replays through the cassette.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { CASES, KNOWN_DIFFERENCES, normalize } from "./ref-corpus.cases.mjs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const LIVE = "https://www.sefaria.org";
const LOCAL = arg("--local", "http://localhost:3370");
const ONLY = arg("--only");
const OUT = arg("--out");
const WRITE_EXPECTED = process.argv.includes("--expected");

async function observe(page, base, path, side) {
  let status = 0;
  try {
    const res = await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = res?.status() ?? 0;
  } catch (e) {
    return { error: String(e).slice(0, 200) };
  }
  if (side === "live") await page.waitForSelector(".segment, .bookPage, .readerNavMenu, .navTitle, .notFound, #s2 .content", { timeout: 25_000 }).catch(() => {});
  else await page.waitForSelector("html[data-hydrated='true']", { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(side === "live" ? 3_000 : 1_500); // the client's own rewrites (a range collapsing) have happened
  const dom = await page.evaluate((side) => {
    const refsOf = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getAttribute("data-ref")).filter(Boolean);
    if (side === "live") {
      return {
        highlighted: [...new Set(refsOf(".readerPanel .segment.highlight[data-ref]"))],
        section: refsOf(".readerPanel .textRange.basetext[data-ref], .readerPanel .textRange[data-ref]")[0] ?? null,
        kind: document.querySelector(".segment") ? "text" : document.querySelector(".bookPage, .readerTextTableOfContents") ? "book" : document.querySelector(".readerNavCategoryMenu, .navTitle") ? "category" : "other",
      };
    }
    return {
      highlighted: [...new Set(refsOf('[data-reader-scroller] [data-highlighted="true"][data-ref]'))],
      section: refsOf("[data-reader-scroller] section[data-ref]")[0] ?? null,
      kind: document.querySelector('[data-reader-scroller] [role="group"][data-ref]') ? "text" : /Start Reading|התחלת קריאה/.test(document.body.innerText) ? "book" : document.querySelector("h1") ? "category" : "other",
    };
  }, side);
  return { status, url: normalize(page.url()), ...dom };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, userAgent: "Mozilla/5.0 (Macintosh) reader-next ref-corpus (read-only)" });
await ctx.addCookies([
  { name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" },
  { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" },
  { name: "cookiesNotificationAccepted", value: "1", domain: new URL(LOCAL).hostname, path: "/" },
]);
let live = await ctx.newPage();
let ours = await ctx.newPage();
/** A page that crashed (a heavy range on the live site) is replaced, and the case reports the crash. */
async function safely(side, path) {
  try {
    return await observe(side === "live" ? live : ours, side === "live" ? LIVE : LOCAL, path, side);
  } catch (e) {
    if (side === "live") live = await ctx.newPage();
    else ours = await ctx.newPage();
    return { error: String(e).split("\n")[0].slice(0, 200) };
  }
}

const results = [];
for (const c of CASES.filter((c) => !ONLY || c.path.includes(ONLY))) {
  const [a, o] = [await safely("live", c.path), await safely("ours", c.path)];
  const diffs = [];
  if (a.error || o.error) diffs.push(`error: live ${a.error ?? "-"} / ours ${o.error ?? "-"}`);
  else {
    if ((a.status >= 400) !== (o.status >= 400)) diffs.push(`status ${a.status} vs ${o.status}`);
    if (a.url !== o.url) diffs.push(`url ${a.url} vs ${o.url}`);
    if (!same(a.highlighted, o.highlighted)) diffs.push(`highlight ${JSON.stringify(a.highlighted)} vs ${JSON.stringify(o.highlighted)}`);
    if (a.kind !== o.kind) diffs.push(`kind ${a.kind} vs ${o.kind}`);
  }
  results.push({ ...c, live: a, ours: o, diffs });
  const known = KNOWN_DIFFERENCES[c.path];
  console.log(`${diffs.length ? (known ? "known" : "DIFF ") : "same "}  ${c.path}${diffs.length ? `\n      ${diffs.join("\n      ")}${known ? `\n      known: ${known}` : ""}` : ""}`);
}
await browser.close();

const n = results.filter((r) => r.diffs.length).length;
const unexplained = results.filter((r) => r.diffs.length && !KNOWN_DIFFERENCES[r.path]).length;
console.log(`\n${results.length} cases, ${results.length - n} the same, ${n} different (${n - unexplained} known, ${unexplained} unexplained)`);
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2));
if (WRITE_EXPECTED) {
  const expected = results.filter((r) => !r.diffs.length && !r.live.error).map((r) => ({ path: r.path, why: r.why, status: r.live.status >= 400 ? r.live.status : 200, url: r.live.url, highlighted: r.live.highlighted, kind: r.live.kind }));
  writeFileSync(new URL("./ref-corpus.expected.json", import.meta.url), JSON.stringify(expected, null, 2) + "\n");
  console.log(`wrote ${expected.length} expected cases`);
}
