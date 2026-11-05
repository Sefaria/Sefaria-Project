#!/usr/bin/env node
// Records real Sefaria public-API responses for a matrix of refs covering every
// book type the reader must support. Output: fixtures/api/<slug>/*.json plus
// fixtures/api/manifest.json.
//
// Usage:
//   node scripts/record-fixtures.mjs            # record everything (incl. _toc, _calendars)
//   node scripts/record-fixtures.mjs genesis-1 berakhot-2a   # only these slugs
//   node scripts/record-fixtures.mjs _toc       # only the global TOC / calendars
//   node scripts/record-fixtures.mjs --list     # print the matrix
//
// Plain Node (>=18) ESM, no dependencies. Requests are sequential with a delay,
// to be polite to the production API.

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.SEFARIA_API ?? "https://www.sefaria.org";
const DELAY_MS = Number(process.env.FIXTURE_DELAY_MS ?? 150);
const MAX_BYTES = 2 * 1024 * 1024; // default cap: larger files are truncated
// Per-file caps. related/links for popular chapters run to 7-16MB; tests only
// need representative rows. The full TOC (~7MB) and big indexes (Zohar ~3MB,
// whose alt structs would be corrupted by array truncation) are kept whole.
const CAPS = { "related.json": 512 * 1024, "links.json": 512 * 1024, "toc.json": Infinity, "index.json": 4 * 1024 * 1024, "index-contracted.json": 4 * 1024 * 1024 };
const UA = "sefaria-reader-dev-fixtures";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "fixtures", "api");

// The v3 query the old client actually sends (static/js/sefaria/sefaria.js
// makeUrlForAPIV3Text): sorted version params, fill_in_missing_segments=1,
// return_format=wrap_all_entities.
const V3_WRAPPED = "version=primary&version=translation&fill_in_missing_segments=1&return_format=wrap_all_entities";
const V3_DEFAULT = "version=primary&version=translation";

/**
 * Matrix. `ref` is the canonical ref to open in the reader. `sectionRef`
 * (optional) overrides which ref is used for related/links (defaults to the
 * v3 response's sectionRef). `extra` adds endpoint-specific files.
 */
const MATRIX = [
  { slug: "genesis-1", ref: "Genesis 1", bookType: "tanakh-torah",
    why: "Torah chapter: Parasha alt struct with aliyot, cantillation/nikkud, many translations in many languages",
    extra: [
      { file: "v3-texts-french.json", path: (r) => `/api/v3/texts/${r}?version=primary&version=french` },
      { file: "v3-texts-multilang.json", path: (r) => `/api/v3/texts/${r}?version=primary&version=english&version=french&version=german&version=spanish` },
      // A word looked up from the text (dictionary sidebar): the request the old client sends.
      { file: "words-bereshit.json", path: () => `/api/words/${encodeURIComponent("בְּרֵאשִׁ֖ית")}?always_consonants=1&never_split=1&lookup_ref=Genesis%201:1` },
      // Genesis 1 in a preferred translation (version preferences, VER-014).
      { file: "v3-texts-koren.json", path: (r) => `/api/v3/texts/${r}?version=primary&version=english%7CThe%20Koren%20Jerusalem%20Bible&fill_in_missing_segments=1&return_format=wrap_all_entities` },
      // The Translations sidebar's request (every translation with text, no gap filling), for one verse.
      { file: "v3-translations-all-1-1.json", path: () => `/api/v3/texts/Genesis_1:1?version=translation%7Call&fill_in_missing_segments=0` },
    ] },
  { slug: "genesis-1-1-5", ref: "Genesis 1:1-5", bookType: "tanakh-torah", why: "Segment range inside one section" },
  { slug: "psalms-23", ref: "Psalms 23", bookType: "tanakh-poetry", why: "Poetry (Writings) - line-break / formatAsPoetry handling" },
  { slug: "isaiah-40", ref: "Isaiah 40", bookType: "tanakh-prophets", why: "Prophets chapter (haftarah source)" },
  { slug: "song-of-songs-1", ref: "Song of Songs 1", bookType: "tanakh-megillah", why: "Megillah / Writings" },
  { slug: "onkelos-genesis-1", ref: "Onkelos Genesis 1", bookType: "targum", why: "Targum that the old client shows with aliyot (categories[2]=='Onkelos')" },
  { slug: "berakhot-2a", ref: "Berakhot 2a", bookType: "talmud-bavli",
    why: "Bavli amud: Talmud address type (daf/amud), Chapters alt struct, manuscripts",
    extra: [
      { file: "manuscripts.json", path: (r) => `/api/manuscripts/${r}` },
      // Web pages citing one segment (the sidebar's Web Pages view): 516 pages across ~30 sites.
      { file: "websites-2a-1.json", path: () => `/api/related/Berakhot_2a:1/websites` },
    ] },
  { slug: "berakhot-2a-1-5", ref: "Berakhot 2a:1-5", bookType: "talmud-bavli", why: "Segment range within an amud" },
  { slug: "berakhot-2a-3b", ref: "Berakhot 2a-3b", bookType: "talmud-bavli", why: "Spanning range across several amudim (nested arrays, isSpanning)" },
  { slug: "jt-berakhot-1-1", ref: "Jerusalem Talmud Berakhot 1:1", bookType: "talmud-yerushalmi",
    why: "Yerushalmi depth 3 (Chapter/Halakhah/Segment); Venice/Vilna alt structs use the Folio address type (4-sided daf a-d)" },
  { slug: "mishnah-berakhot-1", ref: "Mishnah Berakhot 1", bookType: "mishnah", why: "Mishnah chapter" },
  { slug: "tosefta-berakhot-1", ref: "Tosefta Berakhot 1", bookType: "tosefta", why: "Tosefta (Vilna edition)" },
  { slug: "pirkei-avot-1", ref: "Pirkei Avot 1", bookType: "mishnah", why: "Mishnah tractate whose title doesn't start with 'Mishnah'" },
  { slug: "rashi-on-genesis-1", ref: "Rashi on Genesis 1", bookType: "commentary-tanakh", why: "Depth-3 commentary; section ref is a super-section (Chapter -> Verse -> Comment)" },
  { slug: "rashi-on-berakhot-2a", ref: "Rashi on Berakhot 2a", bookType: "commentary-talmud", why: "Talmud commentary with Talmud address type at depth 1" },
  { slug: "tosafot-on-berakhot-2a", ref: "Tosafot on Berakhot 2a", bookType: "commentary-talmud", why: "Talmud commentary (Tosafot)" },
  { slug: "ramban-on-genesis-1", ref: "Ramban on Genesis 1", bookType: "commentary-tanakh", why: "Commentary with long segments and introductions (complex schema)" },
  { slug: "mishneh-torah-foundations-1", ref: "Mishneh Torah, Foundations of the Torah 1", bookType: "halakhah-code", why: "Mishneh Torah: each section is its own index, nested TOC categories" },
  { slug: "shulchan-arukh-oc-1", ref: "Shulchan Arukh, Orach Chayim 1", bookType: "halakhah-code", why: "Siman/Seif address types" },
  { slug: "mishnah-berurah-1", ref: "Mishnah Berurah 1", bookType: "commentary-halakhah", why: "Commentary on Shulchan Arukh, SeifKatan address type, complex schema" },
  { slug: "kitzur-shulchan-arukh-1", ref: "Kitzur Shulchan Arukh 1", bookType: "halakhah-code", why: "Simple Siman/Seif code" },
  { slug: "arukh-hashulchan-oc-1", ref: "Arukh HaShulchan, Orach Chaim 1", bookType: "halakhah-code", why: "Complex schema code (named parts with Siman sections)" },
  { slug: "siddur-ashkenaz-modeh-ani", ref: "Siddur Ashkenaz, Weekday, Shacharit, Preparatory Prayers, Modeh Ani", bookType: "liturgy",
    why: "Deep SchemaNode tree, depth-1 leaf; old client hides segment numbers for Liturgy" },
  { slug: "pesach-haggadah-kadesh", ref: "Pesach Haggadah, Kadesh", bookType: "liturgy", why: "Complex schema, named nodes" },
  { slug: "zohar-bereshit-1", ref: "Zohar, Bereshit 1", bookType: "kabbalah-zohar", why: "Complex Zohar structure (parasha nodes) with daf-based alt structs; translation slot returns a Hebrew translation" },
  { slug: "sefer-yetzirah-1", ref: "Sefer Yetzirah 1", bookType: "kabbalah", why: "Short kabbalistic text, Perek/Mishnah address types" },
  { slug: "bereshit-rabbah-1", ref: "Bereshit Rabbah 1", bookType: "midrash", why: "Midrash Rabbah chapter" },
  { slug: "sefer-hachinukh-1", ref: "Sefer HaChinukh 1", bookType: "halakhah-sifrei-mitzvot", why: "Mitzvah numbering, complex schema with default node" },
  { slug: "guide-perplexed-1-1", ref: "Guide for the Perplexed, Part 1 1", bookType: "jewish-thought-complex", why: "Complex schema with Parts; old client hard-codes no segment numbers" },
  { slug: "kuzari-1-1", ref: "Kuzari 1:1", bookType: "jewish-thought", why: "Segment ref in a simple depth-2 text" },
  { slug: "jastrow-abba-1", ref: "Jastrow, אַבָּא I 1", bookType: "dictionary",
    why: "Dictionary entry (virtual lexicon node, Hebrew headword in ref, English-only)",
    extra: [{ file: "words.json", path: () => `/api/words/${encodeURIComponent("אבא")}?never_split=1` }] },
  { slug: "klein-av-1", ref: "Klein Dictionary, אָב ᴵ", bookType: "dictionary", why: "Dictionary entry with superscript homograph marker in ref" },
  { slug: "teshuvot-harashba-1-98", ref: "Teshuvot haRashba part I 98", bookType: "responsa", why: "Responsa; very sparse shape (only a handful of teshuvot have text)" },
  { slug: "ben-sira-1", ref: "Ben Sira 1", bookType: "second-temple", why: "Second Temple / Apocrypha" },
  { slug: "philo-creation-1", ref: "On the Account of the World's Creation 1", bookType: "translation-only",
    why: "English is the primary (source) language; no Hebrew at all (Philo)" },
  { slug: "peri-megadim-oc-mz-1", ref: "Peri Megadim on Orach Chayim, Mishbezot Zahav 1", bookType: "hebrew-only",
    why: "Hebrew-only text, no translation (warning 104)" },
];

const exists = (p) => readFile(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normRef = (ref) => encodeURIComponent(ref.replace(/ /g, "_")).replace(/%2C/g, ",").replace(/%3A/g, ":");
const titlePath = (t) => encodeURIComponent(t.replace(/ /g, "_")).replace(/%2C/g, ",");

async function getJSON(path) {
  const url = API + path;
  await sleep(DELAY_MS);
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.status >= 500 && attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { _nonJsonBody: text.slice(0, 2000) }; }
  return { url, status: res.status, body };
}

/** Halve the longest array in the tree until the JSON fits MAX_BYTES. */
function truncateToFit(body, max = MAX_BYTES) {
  let json = JSON.stringify(body, null, 2);
  const originalBytes = Buffer.byteLength(json);
  if (originalBytes <= max) return { json, truncated: false, originalBytes };
  const findLongest = (node, best = { arr: null, len: 0 }) => {
    if (Array.isArray(node)) {
      if (node.length > best.len) { best.arr = node; best.len = node.length; }
      node.forEach((n) => findLongest(n, best));
    } else if (node && typeof node === "object") {
      Object.values(node).forEach((n) => findLongest(n, best));
    }
    return best;
  };
  let guard = 0;
  while (Buffer.byteLength(json) > max && guard++ < 200) {
    const { arr, len } = findLongest(body);
    if (!arr || len <= 1) break;
    arr.length = Math.ceil(len / 2);
    json = JSON.stringify(body, null, 2);
  }
  return { json, truncated: true, originalBytes };
}

// requests.json: exact request (pathname + search, as fetch sent it) -> fixture
// file relative to fixtures/api. Used by the test mock server.
let REQUESTS = {};
const requestKey = (url) => { const u = new URL(url); return u.pathname + u.search; };

async function record(dir, file, path, filesMeta) {
  const rel = `${dir.slice(OUT.length + 1)}/${file}`;
  const key = requestKey(API + path);
  // Identical request already recorded (e.g. two range refs sharing a sectionRef):
  // don't fetch or store it twice, point at the existing fixture.
  const existing = REQUESTS[key];
  if (existing && existing !== rel && (await exists(join(OUT, existing)))) {
    filesMeta[file] = { url: API + path, sameAs: existing };
    console.log(`  ${file.padEnd(28)} -> ${existing}`);
    return { status: 200, body: JSON.parse(await readFile(join(OUT, existing), "utf8")) };
  }
  const { url, status, body } = await getJSON(path);
  const { json, truncated, originalBytes } = truncateToFit(structuredClone(body), CAPS[file] ?? MAX_BYTES);
  await writeFile(join(dir, file), json + "\n");
  REQUESTS[requestKey(url)] = rel;
  filesMeta[file] = { url, status, bytes: Buffer.byteLength(json), ...(truncated ? { truncated: true, originalBytes } : {}) };
  const flag = status !== 200 ? ` [HTTP ${status}]` : truncated ? ` [truncated from ${originalBytes}]` : "";
  console.log(`  ${file.padEnd(28)} ${String(filesMeta[file].bytes).padStart(9)}B${flag}`);
  return { status, body };
}

async function recordEntry(entry) {
  const dir = join(OUT, entry.slug);
  await mkdir(dir, { recursive: true });
  console.log(`\n${entry.slug}  (${entry.ref})`);
  const files = {};
  const r = normRef(entry.ref);

  const v3 = await record(dir, "v3-texts.json", `/api/v3/texts/${r}?${V3_WRAPPED}`, files);
  await record(dir, "v3-texts-default.json", `/api/v3/texts/${r}?${V3_DEFAULT}`, files);
  const d = v3.body ?? {};
  const title = d.indexTitle ?? entry.title ?? entry.ref.replace(/[ ,]+[\d:ab-]+$/, "");
  const sectionRef = entry.sectionRef ?? d.sectionRef ?? entry.ref;
  const t = titlePath(title);

  // Requests the reader makes beyond the opened ref (cache + prefetch tests rely on these):
  //  - the first available section when the ref is above section level (commentary chapter, book)
  //  - the next section (prefetch)
  const wrapped = (ref) => `/api/v3/texts/${normRef(ref)}?${V3_WRAPPED}`;
  if (d.firstAvailableSectionRef && d.firstAvailableSectionRef !== d.ref && !d.isSpanning) {
    await record(dir, "section-first.json", wrapped(d.firstAvailableSectionRef), files);
  }
  if (d.next && !d.isSpanning) await record(dir, "section-next.json", wrapped(d.next), files);
  await record(dir, "index.json", `/api/v2/raw/index/${t}`, files);
  // The contracted index (what the old client's BookPage uses) differs: it has
  // `alts` (not `alt_structs`), heTitle, sectionNames, depth, content counts.
  await record(dir, "index-contracted.json", `/api/v2/index/${t}?with_content_counts=1&with_related_topics=1`, files);
  await record(dir, "shape.json", `/api/shape/${t}`, files);
  await record(dir, "related.json", `/api/related/${normRef(sectionRef)}?with_sheet_links=1`, files);
  await record(dir, "links.json", `/api/links/${normRef(sectionRef)}?with_text=0&with_sheet_links=1`, files);
  await record(dir, "versions.json", `/api/texts/versions/${t}`, files);
  await record(dir, "name.json", `/api/name/${encodeURIComponent(title)}?limit=10`, files);
  for (const x of entry.extra ?? []) await record(dir, x.file, x.path(r), files);

  return {
    slug: entry.slug,
    ref: entry.ref,
    resolvedRef: d.ref ?? null,
    sectionRef,
    title,
    categories: d.categories ?? null,
    bookType: entry.bookType,
    why: entry.why,
    textDepth: d.textDepth ?? null,
    isComplex: d.isComplex ?? null,
    sectionNames: d.sectionNames ?? null,
    addressTypes: d.addressTypes ?? null,
    warnings: d.warnings ?? null,
    files,
  };
}

async function recordGlobals() {
  const out = [];
  for (const [slug, file, path] of [
    ["_toc", "toc.json", "/api/index"],
    ["_calendars", "calendars.json", "/api/calendars?diaspora=1"],
  ]) {
    const dir = join(OUT, slug);
    await mkdir(dir, { recursive: true });
    console.log(`\n${slug}`);
    const files = {};
    await record(dir, file, path, files);
    out.push({ slug, ref: null, title: null, bookType: "global", why: slug === "_toc" ? "Full library TOC (/api/index)" : "Daily learning calendars (/api/calendars)", files });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    for (const e of MATRIX) console.log(`${e.slug.padEnd(30)} ${e.bookType.padEnd(24)} ${e.ref}`);
    return;
  }
  const wanted = new Set(args);
  const all = wanted.size === 0;
  const unknown = [...wanted].filter((s) => !s.startsWith("_") && !MATRIX.some((e) => e.slug === s));
  if (unknown.length) { console.error(`Unknown slug(s): ${unknown.join(", ")}`); process.exit(1); }

  await mkdir(OUT, { recursive: true });
  const manifestPath = join(OUT, "manifest.json");
  let manifest = { recordedAt: null, apiBase: API, entries: [] };
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch {}
  const requestsPath = join(OUT, "requests.json");
  try { REQUESTS = JSON.parse(await readFile(requestsPath, "utf8")); } catch {}
  // On a re-run, drop map entries that point into slugs being re-recorded so
  // stale requests (e.g. a changed ref) don't linger.
  const rerun = (slug) => all || wanted.has(slug) || (slug.startsWith("_") && (wanted.has("_toc") || wanted.has("_calendars")));
  for (const [k, v] of Object.entries(REQUESTS)) if (rerun(v.split("/")[0])) delete REQUESTS[k];

  const results = [];
  if (all || wanted.has("_toc") || wanted.has("_calendars")) results.push(...(await recordGlobals()));
  for (const entry of MATRIX) {
    if (!all && !wanted.has(entry.slug)) continue;
    try {
      results.push({ ...(await recordEntry(entry)), recordedAt: new Date().toISOString() });
    } catch (e) {
      console.error(`  FAILED ${entry.slug}: ${e.message}`);
    }
  }

  // Merge into existing manifest, keeping MATRIX order (globals first).
  const bySlug = new Map(manifest.entries.map((e) => [e.slug, e]));
  for (const r of results) bySlug.set(r.slug, { ...r, recordedAt: r.recordedAt ?? new Date().toISOString() });
  const order = ["_toc", "_calendars", ...MATRIX.map((e) => e.slug)];
  manifest.entries = order.filter((s) => bySlug.has(s)).map((s) => bySlug.get(s));
  manifest.recordedAt = new Date().toISOString();
  manifest.apiBase = API;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const sorted = Object.fromEntries(Object.entries(REQUESTS).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(requestsPath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Wrote ${requestsPath} (${Object.keys(sorted).length} requests)`);
  console.log(`\nWrote ${manifestPath} (${manifest.entries.length} entries)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
