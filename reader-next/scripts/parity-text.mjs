// Text parity: for each book type in the fixture matrix, the segments (ref → text incl. number) on screen at the same
// address on sefaria.org and in the rebuild, per language mode. Reports refs missing on either side and differing text.
// Usage: node scripts/parity-text.mjs [slug ...]   (env LANGS=bi,he,en  W=1280)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../fixtures/api/manifest.json", import.meta.url), "utf8"));
const only = process.argv.slice(2);
const entries = manifest.entries.filter((e) => e.ref && (!only.length || only.includes(e.slug)));
const LANGS = (process.env.LANGS ?? "bi,he,en").split(",");
const W = Number(process.env.W ?? 1280);
const sq = (t) => t.replace(/[\d,]+ connections? available/g, "").replace(/[\s​‎‏]+/g, " ").trim();
const urlRef = (r) => r.replace(/ /g, "_").replace(/:/g, ".");

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: 860 } });
await ctx.addCookies([{ name: "interfaceLang", value: "english", domain: "www.sefaria.org", path: "/" }, { name: "cookiesNotificationAccepted", value: "1", domain: ".sefaria.org", path: "/" }]);
const live = await ctx.newPage(), ours = await ctx.newPage();

async function segments(page, side) {
  return page.evaluate((side) => {
    const sel = side === "live" ? ".readerPanel .textColumn [data-ref], .readerPanel .segment[data-ref]" : '[data-reader-scroller] [role="group"][data-ref]';
    const out = {};
    for (const el of document.querySelectorAll(sel)) {
      const ref = el.getAttribute("data-ref");
      if (!ref || out[ref] !== undefined) continue;
      if (side === "live" && !el.classList.contains("segment")) continue;
      let t = el.innerText;
      // The live site hides the number of the language not in use with CSS that innerText honours; the number is still shown
      const num = side === "live" ? el.querySelector(".segmentNumber")?.textContent?.trim() : undefined;
      if (num && !t.trim().startsWith(num)) t = num + " " + t;
      // Page markers (Vilna/Venice) are text in the rebuild and an empty element with a pseudo-element on the live site
      for (const m of el.querySelectorAll("[data-overlay][data-value], [data-overlay]")) {
        const v = m.getAttribute("data-value") ?? "";
        if (v && m.textContent) t = t.replace(v, "");
      }
      out[ref] = t;
    }
    return out;
  }, side);
}

let bad = 0;
for (const e of entries) {
  for (const lang of LANGS) {
    const path = `/${urlRef(e.ref)}?lang=${lang}`;
    try {
      await live.goto("https://www.sefaria.org" + path, { waitUntil: "domcontentloaded" });
      await ours.goto("http://localhost:3100" + path, { waitUntil: "domcontentloaded" });
      await live.waitForSelector(".segment", { timeout: 25000 }).catch(() => {});
      await ours.waitForSelector('[role="group"][data-ref]', { timeout: 25000 }).catch(() => {});
      await live.waitForTimeout(1200); await ours.waitForTimeout(600);
      const a = await segments(live, "live"), o = await segments(ours, "ours");
      const first = Object.keys(a)[0] ?? e.ref;
      const section = first.replace(/[ :]\d+$/, ""); // the section the live page opened on
      const inSection = (r) => r === section || r.startsWith(section + ":") || r.startsWith(section + " ");
      const refs = Object.keys(a).filter(inSection);
      const missing = refs.filter((r) => o[r] === undefined);
      const diff = refs.filter((r) => o[r] !== undefined && sq(a[r]) !== sq(o[r]));
      const extra = Object.keys(o).filter((r) => inSection(r) && a[r] === undefined);
      const ok = !missing.length && !diff.length && refs.length > 0; // ours may hold more: the live site loads fewer sections at first
      if (!ok) bad++;
      if (!refs.length) console.log("   live refs:", Object.keys(a).slice(0, 3), "ours refs:", Object.keys(o).slice(0, 3));
      console.log(ok ? "SAME" : "DIFF", e.slug.padEnd(28), lang, `live=${refs.length} ours=${Object.keys(o).filter(inSection).length}`, missing.length ? `missing:${missing.slice(0, 3)}` : "", extra.length ? `extra:${extra.slice(0, 3)}` : "");
      for (const r of diff.slice(0, 2)) {
        const x = sq(a[r]), y = sq(o[r]); let i = 0; while (x[i] === y[i] && i < x.length) i++;
        console.log("   ", r, `@${i}`, "\n     live:", x.slice(Math.max(0, i - 25), i + 80), "\n     ours:", y.slice(Math.max(0, i - 25), i + 80));
      }
    } catch (err) {
      bad++; console.log("ERR ", e.slug, lang, err.message.slice(0, 100));
    }
  }
}
await b.close();
console.log(bad ? `${bad} differences` : "all same");
