// Language parity: for every case in lang-cases.mjs, open the same address on www.sefaria.org (the old client) and in this client,
// and record what each shows: the panel title and its subtitle, the section headers, the segment numbers (letters or digits, and
// where they sit against the text), which language columns show and in what order, direction, and the font, size, weight and colour
// actually used for the text, the numbers and the headers. Writes a markdown table of differences per case, a JSON dump of every
// measurement, and a screenshot pair per case.
//
// Read-only on www.sefaria.org: it opens pages, never signs in, never submits anything. The interface language is switched as a
// reader does, through /interface/<lang>?next=<path> on both sides.
//
// Usage (from reader-next/, with this client's dev server running against the live API, see README.md):
//   node scripts/parity/lang-parity.mjs --new http://localhost:3800 --out <dir> [--only id,id] [--group core,phone] [--jobs 3]
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildCases, caseUrl, KINDS } from "./lang-cases.mjs";
import { compare, ROOT_CAUSES } from "./lang-compare.mjs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const NEW = arg("new", "http://localhost:3800").replace(/\/$/, "");
const LEGACY = arg("legacy", "https://www.sefaria.org").replace(/\/$/, "");
const OUT = arg("out", join(tmpdir(), "lang-parity"));
const SHOTS = arg("shots", join(OUT, "shots"));
const JOBS = Number(arg("jobs", "3"));
const only = arg("only", "")?.split(",").filter(Boolean) ?? [];
const groups = arg("group", "")?.split(",").filter(Boolean) ?? [];
const noShots = process.argv.includes("--no-shots");

mkdirSync(OUT, { recursive: true });
if (!noShots) mkdirSync(SHOTS, { recursive: true });

let cases = buildCases();
if (only.length) cases = cases.filter((c) => only.includes(c.id));
if (groups.length) cases = cases.filter((c) => groups.includes(c.group));

/* ── in-page measurement ─────────────────────────────────────────────────────────────────────────────── */

// Runs in the page. `side` is "legacy" or "new". Marks the elements whose rendered font is looked up afterwards (data-lp="…").
function measure(side, preferRef) {
  const vis = (e) => {
    if (!e) return false;
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const sq = (t) => (t ?? "").replace(/[\s​‎‏]+/g, " ").trim();
  const script = (t) => {
    const he = (t.match(/[֐-׿]/g) || []).length, en = (t.match(/[A-Za-z0-9]/g) || []).length;
    return he === 0 && en === 0 ? "none" : he >= en ? "he" : "en";
  };
  // the element (self or descendant) holding the most text directly: the one whose rendered font is the text's
  const textHost = (el) => {
    let best = null, bestLen = 0;
    for (const n of [el, ...el.querySelectorAll("*")]) {
      if (!vis(n)) continue;
      let len = 0;
      for (const c of n.childNodes) if (c.nodeType === 3) len += c.textContent.trim().length;
      if (len > bestLen) {
        best = n;
        bestLen = len;
      }
    }
    return best;
  };
  const style = (el, tag) => {
    if (!el) return null;
    const host = textHost(el) ?? el;
    host.setAttribute("data-lp", tag);
    const cs = getComputedStyle(host);
    return { size: cs.fontSize, weight: cs.fontWeight, color: cs.color, dir: cs.direction, align: getComputedStyle(el).textAlign, family: cs.fontFamily.split(",")[0].trim() };
  };
  for (const e of document.querySelectorAll("[data-lp]")) e.removeAttribute("data-lp");

  const L = side === "legacy";
  const panel = L ? document.querySelector(".readerPanel") : document;
  if (!panel) return { error: "no panel" };

  // title and subtitle
  let title = "", subtitle = "", titleEl = null;
  if (L) {
    const box = panel.querySelector(".readerControls .readerTextTocBox");
    const t = box?.querySelector(".readerControlsTitle");
    titleEl = t ? [...t.querySelectorAll(".contentSpan")].find(vis) ?? t : null;
    title = sq(titleEl?.innerText);
    const all = (box?.innerText ?? "").split("\n").map(sq).filter(Boolean);
    subtitle = all.filter((x) => x !== title).join(" | ");
  } else {
    titleEl = document.querySelector("header h1");
    title = sq(titleEl?.innerText);
    subtitle = [...(document.querySelector("header h1 + div")?.children ?? [])].map((e) => sq(e.innerText)).filter(Boolean).join(" | ");
  }

  // the book's title at the top of the column (only when the first section is the book's first)
  const bookEl = L ? panel.querySelector(".textColumn .bookMetaDataBox .title") : document.querySelector('[data-reader-scroller] p[class*="bookTitle"]');
  const bookVis = bookEl && vis(bookEl) ? (L ? [...bookEl.querySelectorAll(".contentSpan")].find(vis) ?? bookEl : bookEl) : null;
  const bookTitle = bookVis ? sq(bookVis.innerText) : null;

  // sections: ref → header
  const sections = [];
  const secEls = L ? panel.querySelectorAll(".textColumn .textRange.basetext[data-ref]") : document.querySelectorAll("[data-reader-scroller] section[data-ref]");
  for (const s of secEls) {
    const h = L ? s.querySelector(":scope > .title .titleBox") : s.querySelector(":scope > div > h2");
    const hv = h && vis(h) ? (L ? [...h.querySelectorAll(".contentSpan")].find(vis) ?? h : h) : null;
    sections.push({ ref: s.getAttribute("data-ref"), header: hv ? sq(hv.innerText) : null, el: hv });
  }

  // segments
  const segs = [];
  const segEls = L ? panel.querySelectorAll(".textColumn .textRange.basetext .segment[data-ref]") : document.querySelectorAll('[data-reader-scroller] [role="group"][data-ref]');
  for (const s of segEls) {
    if (!vis(s) || segs.length >= 2000) continue;
    const numEl = L ? [...s.querySelectorAll(":scope > .segmentNumber .contentSpan")].find(vis) : s.querySelector(":scope > [data-number]");
    const body = L ? s.querySelector(":scope > .segmentText") : s.querySelector(":scope > p");
    const sideEls = L ? [...(body?.querySelectorAll(".contentSpan") ?? [])].filter(vis) : [...(body?.querySelectorAll("[data-side]") ?? [])].filter(vis);
    const sides = sideEls
      .map((e) => {
        const r = e.getBoundingClientRect();
        const role = L ? (e.classList.contains("primary") ? "primary" : "translation") : e.getAttribute("data-side");
        return { role, script: script(e.innerText), top: Math.round(r.top), left: Math.round(r.left), el: e };
      })
      .filter((x) => x.script !== "none");
    let numPos = null, numText = null;
    if (numEl && vis(numEl) && sq(numEl.innerText)) {
      numText = sq(numEl.innerText);
      // left / right of the text, between two side-by-side columns, or on top of a column's text ("over-text")
      const nr = numEl.getBoundingClientRect();
      const cx = nr.left + nr.width / 2;
      // running text (continuous): the column's box, since a segment's inline spans wrap across the whole line
      const continuous = L ? panel.classList.contains("continuous") : s.closest("[data-layout]")?.getAttribute("data-layout") === "continuous";
      const col = continuous ? (L ? s.closest(".text") : s.closest("[data-layout]")) : null;
      const contentBox = (e) => {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight) };
      };
      const rects = col ? [contentBox(col)] : sides.map((x) => x.el.getBoundingClientRect());
      const minL = Math.min(...rects.map((r) => r.left)), maxR = Math.max(...rects.map((r) => r.right));
      if (!rects.length) numPos = "no-text";
      else if (rects.some((r) => cx > r.left + 2 && cx < r.right - 2)) numPos = "over-text";
      else numPos = cx <= minL ? "left" : cx >= maxR ? "right" : "between";
    }
    segs.push({ ref: s.getAttribute("data-ref"), num: numText, numPos, sides, el: s, numEl });
  }

  // the first segment showing both sides, else the first segment: its sides' styles and the order of the columns
  const both = segs.find((x) => x.ref === preferRef) ?? segs.find((x) => x.sides.length >= 2) ?? segs[0];
  let order = null;
  if (both && both.sides.length >= 2) {
    const [a, b] = both.sides;
    const stacked = Math.abs(a.top - b.top) > 5;
    const sorted = [...both.sides].sort((x, y) => (stacked ? x.top - y.top : x.left - y.left));
    order = (stacked ? "stacked:" : "side:") + sorted.map((x) => x.script).join(stacked ? "/" : "|");
  }
  const pri = both?.sides.find((x) => x.role === "primary"), tra = both?.sides.find((x) => x.role === "translation");
  const firstNum = segs.find((x) => x.num);
  const firstHeader = sections.find((x) => x.el);
  const out = {
    url: location.href,
    title, titleScript: script(title), subtitle, bookTitle,
    titleStyle: style(titleEl, "title"),
    sections: sections.map(({ ref, header }) => ({ ref, header })),
    headerStyle: style(firstHeader?.el, "sec"),
    segments: segs.map(({ ref, num, numPos, sides }) => ({ ref, num, numPos, sides: sides.map(({ role, script }) => `${role}:${script}`).join(",") })),
    numStyle: style(firstNum?.numEl, "num"),
    order,
    sampleRef: both?.ref ?? null,
    primaryStyle: style(pri?.el, "pri"),
    translationStyle: style(tra?.el, "tra"),
    panelClass: L ? panel.className : document.querySelector("[data-language]")?.getAttribute("data-language") + "/" + document.querySelector("[data-language]")?.getAttribute("data-bilayout"),
    // direction of the segment boxes (the old client sets it on .textRange, this one on the reading surface)
    pageDir: both ? getComputedStyle(both.el).direction : null,
  };
  return out;
}

async function renderedFonts(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const out = {};
  for (const tag of ["title", "sec", "num", "pri", "tra"]) {
    try {
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-lp="${tag}"]` });
      if (!nodeId) continue;
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      fonts.sort((a, b) => b.glyphCount - a.glyphCount);
      out[tag] = fonts[0]?.familyName ?? null;
    } catch {
      /* the node went away */
    }
  }
  await cdp.detach().catch(() => {});
  return out;
}

/* ── one side of one case ────────────────────────────────────────────────────────────────────────────── */

async function openSide(browser, c, which, preferRef) {
  const base = which === "legacy" ? LEGACY : NEW;
  const dev = c.device === "phone" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 900 } };
  const ctx = await browser.newContext({ ...dev, locale: "en-US" });
  const host = new URL(base).hostname;
  const domains = which === "legacy" ? [".sefaria.org", ".sefaria.org.il"] : [host];
  const cookies = [];
  for (const domain of domains) {
    cookies.push({ name: "cookiesNotificationAccepted", value: "1", domain, path: "/" });
    for (const [name, value] of Object.entries(c.cookies ?? {})) cookies.push({ name, value, domain, path: "/" });
  }
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const path = caseUrl(c);
  // the interface language as a reader sets it: /interface/<lang>?next=<path>
  const url = `${base}/interface/${c.iface}?next=${encodeURIComponent(path)}`;
  const sel = which === "legacy" ? ".readerPanel .segment" : '[data-reader-scroller] [role="group"][data-ref]';
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(sel, { timeout: 30000 });
  } catch (e) {
    return { ctx, page, data: { error: `load: ${String(e.message).split("\n")[0]}` } };
  }
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(2000); // the old client places its segment numbers after layout
  if (c.entry === "scroll") {
    const box = page.viewportSize();
    await page.mouse.move(box.width / 2, box.height / 2);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(500);
      const n = await page.evaluate((L) => (L ? document.querySelectorAll(".readerPanel .textRange.basetext[data-ref]") : document.querySelectorAll("[data-reader-scroller] section[data-ref]")).length, which === "legacy");
      if (n >= 3) break;
    }
    await page.waitForTimeout(1500);
  }
  const data = await page.evaluate("(" + measure.toString() + ")(" + JSON.stringify(which) + "," + JSON.stringify(preferRef ?? null) + ")");
  data.fonts = await renderedFonts(page).catch(() => ({}));
  return { ctx, page, data };
}

async function runCase(browser, c) {
  // the old client first, so this client's styles are read on the same segment
  const a = await openSide(browser, c, "legacy");
  const b = await openSide(browser, c, "new", a.data.sampleRef);
  if (!noShots) {
    await a.page.screenshot({ path: join(SHOTS, `${c.id}-legacy.png`) }).catch(() => {});
    await b.page.screenshot({ path: join(SHOTS, `${c.id}-new.png`) }).catch(() => {});
  }
  await a.ctx.close();
  await b.ctx.close();
  const diffs = a.data.error || b.data.error ? [{ cause: "LOAD", detail: `legacy: ${a.data.error ?? "ok"}; new: ${b.data.error ?? "ok"}` }] : compare(a.data, b.data, c);
  return { case: c, legacy: a.data, new: b.data, diffs };
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────────────── */

let results = [];
const fromJson = arg("from-json", "");
if (fromJson) {
  // compare again from a previous run's measurements (no browsing): for changes to lang-compare.mjs
  results = JSON.parse(readFileSync(fromJson, "utf8")).map((r) => ({
    ...r,
    diffs: !r.legacy || !r.new ? r.diffs : r.legacy.error || r.new.error ? r.diffs : compare(r.legacy, r.new, r.case),
  }));
  cases = results.map((r) => r.case);
} else {
  const browser = await chromium.launch();
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const c = cases[next++];
      let r;
      try {
        r = await runCase(browser, c);
      } catch (e) {
        r = { case: c, diffs: [{ cause: "LOAD", detail: String(e.message).split("\n")[0] }] };
      }
      results.push(r);
      console.log(`${String(results.length).padStart(3)}/${cases.length} ${c.id.padEnd(40)} ${r.diffs.length ? r.diffs.map((d) => d.cause).join(",") : "SAME"}`);
    }
  }
  await Promise.all(Array.from({ length: JOBS }, worker));
  await browser.close();
}

results.sort((x, y) => cases.indexOf(x.case) - cases.indexOf(y.case));
writeFileSync(join(OUT, "lang-parity-run.json"), JSON.stringify(results, null, 1));

// report
const byCause = {};
for (const r of results) for (const d of r.diffs) (byCause[d.cause] ??= new Set()).add(r.case.id);
const kindNote = Object.fromEntries(KINDS.map((k) => [k.k, k.note]));
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines = [];
lines.push("# Language parity run", "");
lines.push(`Old client: ${LEGACY}. New client: ${NEW}. Cases: ${results.length}. Cases with at least one difference: ${results.filter((r) => r.diffs.length).length}.`, "");
lines.push("## Differences by root cause", "", "| cause | rule | cases | what it means |", "|---|---|---|---|");
for (const [cause, ids] of Object.entries(byCause).sort((a, b) => b[1].size - a[1].size)) {
  const rc = ROOT_CAUSES[cause] ?? { rule: "?", what: "" };
  lines.push(`| ${cause} | ${rc.rule} | ${ids.size} | ${esc(rc.what)} |`);
}
lines.push("", "## Per case", "", "| id | group | text | url | differences |", "|---|---|---|---|---|");
for (const r of results) {
  const c = r.case;
  const d = r.diffs.length ? r.diffs.map((x) => `**${x.cause}** ${esc(x.detail)}`).join("<br>") : "same";
  lines.push(`| ${c.id} | ${c.group} | ${esc(kindNote[c.kind] ?? c.kind)} | \`${esc(caseUrl(c))}\` iface=${c.iface} ${c.device}${c.cookies ? " " + esc(JSON.stringify(c.cookies)) : ""} | ${d} |`);
}
writeFileSync(join(OUT, "lang-parity-run.md"), lines.join("\n") + "\n");
console.log(`\nwrote ${join(OUT, "lang-parity-run.md")}`);
for (const [cause, ids] of Object.entries(byCause).sort((a, b) => b[1].size - a[1].size)) console.log(`${cause.padEnd(22)} ${ids.size}`);
