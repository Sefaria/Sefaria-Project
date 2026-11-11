// Makes reader-next/fixtures safe to commit: no personal data about Sefaria users, minified JSON, and only the files that unit tests,
// stories and scripts read.
//
//   node scripts/fixtures/scrub.mjs            scrub and minify every JSON file under fixtures/ in place
//   node scripts/fixtures/scrub.mjs --prune    also delete fixture files not listed in scripts/fixtures/keep.txt, and drop the
//                                              requests.json / search-requests.json entries that point at deleted files
//   node scripts/fixtures/scrub.mjs --check    change nothing; exit 1 if any file still holds personal data or is not minified
//
// What it replaces (library texts, version credits, topics, web page titles and other public catalogue data are kept as recorded):
//   - people on sheets and notes (ownerName, viaOwnerName, assignerName, full_name, ...)  -> "Sheet Author 12"
//     and users among name completions (type "User": title, key, pic; their entries in the plain "completions" list too)
//   - their profile links (/profile/<slug>, anywhere in a string)                         -> /profile/sheet-author-12
//   - their user ids (owner, assigner, likes)                                              -> 12
//   - profile pictures (ownerImageUrl, profile_pic_url, ...)                              -> null
//   - a sheet's own text (title, summary, attribution), which users write and may name people -> "Source Sheet <id>", "", ""
//   - a sheet's topic tags, which its owner types                                         -> "Sheet Topic 5" (slug sheet-topic-5)
//   - authors of web pages (Resources > Web Pages)                                        -> "Web Author 3"
//   - email addresses, anywhere in a string                                               -> user7@example.com
//     (except Sefaria's service addresses in SERVICE_EMAILS)
// Numbering follows first appearance, walking files in sorted path order, so running it twice changes nothing and the same person gets
// the same number in every file. Placeholders already in the tree keep their numbers; new people get the next free one.
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const HERE = new URL("../../", import.meta.url).pathname;
export const ROOT = process.env.FIXTURES_DIR || join(HERE, "fixtures");
const KEEP = new URL("./keep.txt", import.meta.url).pathname;

export const SERVICE_EMAILS = new Set(["hello@sefaria.org", "help@sefaria.org", "contact@sefaria.org", "corrections@sefaria.org", "developers@sefaria.org", "info@sefaria.org"]);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g;
const PROFILE = /\/profile\/([A-Za-z0-9._~%-]+)/g;
const PROFILE_PICTURE = /^https?:\/\/(storage\.googleapis\.com\/sefaria-profile-pictures|(www\.|secure\.)?gravatar\.com)\//;

const PERSON_NAME_KEYS = ["ownerName", "viaOwnerName", "assignerName", "full_name", "fullName", "author_name", "authorName", "username"];
const PROFILE_URL_KEYS = ["ownerProfileUrl", "viaOwnerProfileUrl", "assignerProfileUrl", "profileUrl", "profile_url", "authorUrl", "author_url"];
const IMAGE_KEYS = ["ownerImageUrl", "imageUrl", "profile_pic_url", "profilePicUrl", "profile_pic_url_small", "author_image", "ownerImage"];
const USER_ID_KEYS = ["owner", "assigner", "uid", "user_id", "userId"];
const PERSON_PARTS = { ownerName: ["owner", "ownerProfileUrl"], viaOwnerName: [null, "viaOwnerProfileUrl"], assignerName: ["assigner", "assignerProfileUrl"] };

/** Placeholder registries: real key -> number, numbered by first appearance after any placeholders already present. */
class Registry {
  constructor(pattern) {
    this.pattern = pattern;
    this.map = new Map();
    this.used = new Set();
  }
  reserve(value) {
    const m = typeof value === "string" ? value.match(this.pattern) : null;
    if (m) this.used.add(Number(m[1]));
  }
  number(key) {
    const own = typeof key === "string" ? key.match(this.pattern) : null;
    if (own) return Number(own[1]);
    if (this.map.has(key)) return this.map.get(key);
    let n = 1;
    while (this.used.has(n)) n++;
    this.used.add(n);
    this.map.set(key, n);
    return n;
  }
}

export function createScrubber() {
  const people = new Registry(/^(?:Sheet Author |sheet-author-|person:sheet-author-)(\d+)$/);
  const webAuthors = new Registry(/^Web Author (\d+)$/);
  const sheetTopics = new Registry(/^(?:Sheet Topic |sheet-topic-)(\d+)$/);
  const emails = new Registry(/^user(\d+)@example\.com$/);
  const ids = new Map(); // real user id -> person number
  const realNames = new Map(); // a user's name among name completions -> their key, to replace it in the plain "completions" list too

  const slugOf = (url) => (typeof url === "string" ? [...url.matchAll(PROFILE)][0]?.[1] : undefined);
  const personKey = (name, url) => {
    const slug = slugOf(url);
    if (slug) return slug.startsWith("sheet-author-") ? slug : `slug:${slug}`;
    return typeof name === "string" && /^Sheet Author \d+$/.test(name) ? name : `name:${String(name).trim().toLowerCase()}`;
  };
  const personNumber = (name, url, id) => {
    const n = people.number(personKey(name, url));
    if (id != null && typeof id !== "object") ids.set(String(id), n);
    return n;
  };
  const idNumber = (id) => {
    const k = String(id);
    if (!ids.has(k)) ids.set(k, people.number(`id:${k}`));
    return ids.get(k);
  };

  const scrubString = (s) =>
    s
      .replace(EMAIL, (e) => (SERVICE_EMAILS.has(e.toLowerCase()) || /@example\.com$/i.test(e) ? e : `user${emails.number(e.toLowerCase())}@example.com`))
      .replace(PROFILE, (_m, slug) => `/profile/sheet-author-${people.number(slug.startsWith("sheet-author-") ? slug : `slug:${slug}`)}`);

  /** First pass: note placeholders already present so new people never reuse their numbers. */
  function reserve(node) {
    if (Array.isArray(node)) return node.forEach(reserve);
    if (node && typeof node === "object") {
      if (node.type === "User" && typeof node.title === "string" && typeof node.key === "string") realNames.set(node.title, personKey(node.title, `/profile/${node.key}`));
      return Object.values(node).forEach(reserve);
    }
    if (typeof node === "string") {
      people.reserve(node);
      webAuthors.reserve(node);
      sheetTopics.reserve(node);
      emails.reserve(node);
      for (const [, slug] of node.matchAll(PROFILE)) people.reserve(slug);
      for (const [e] of node.matchAll(EMAIL)) emails.reserve(e);
    }
  }

  function scrub(node) {
    if (Array.isArray(node)) return node.map(scrub);
    if (typeof node === "string") return scrubString(node);
    if (!node || typeof node !== "object") return node;
    const out = {};
    const isSheet = typeof node.sheetUrl === "string" || node.type === "sheet" || "ownerName" in node;
    // A user among name completions (/api/name): { title: <their name>, type: "User", key: <profile slug>, pic: <picture> }.
    if (node.type === "User" && typeof node.key === "string") {
      const n = people.number(personKey(node.title, `/profile/${node.key}`));
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, k === "title" ? `Sheet Author ${n}` : k === "key" ? `sheet-author-${n}` : k === "pic" ? null : scrub(v)]),
      );
    }
    const isWebPage = typeof node.domain === "string" && typeof node.url === "string" && "linkerHits" in node;
    // People named on this object, numbered before any of their fields are rewritten.
    const numbers = {};
    for (const [nameKey, [idKey, urlKey]] of Object.entries(PERSON_PARTS)) {
      if (typeof node[nameKey] === "string" && node[nameKey]) numbers[nameKey] = personNumber(node[nameKey], node[urlKey], idKey ? node[idKey] : undefined);
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "completions" && Array.isArray(v)) {
        // /api/name lists every completion's title as a plain string too; only the users' entries are replaced.
        out[k] = v.map((c) => (typeof c === "string" && realNames.has(c) ? `Sheet Author ${people.number(realNames.get(c))}` : scrub(c)));
      } else if (PERSON_NAME_KEYS.includes(k) && typeof v === "string" && v) {
        const n = numbers[k] ?? personNumber(v, undefined, undefined);
        out[k] = `Sheet Author ${n}`;
      } else if (PROFILE_URL_KEYS.includes(k) && typeof v === "string" && v) {
        const nameKey = Object.keys(PERSON_PARTS).find((nk) => PERSON_PARTS[nk][1] === k);
        const n = nameKey && numbers[nameKey] ? numbers[nameKey] : people.number(personKey(undefined, v));
        out[k] = `/profile/sheet-author-${n}`;
      } else if (IMAGE_KEYS.includes(k) && typeof v === "string" && (PROFILE_PICTURE.test(v) || isSheet)) {
        out[k] = null;
      } else if (USER_ID_KEYS.includes(k) && (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) && (isSheet || k !== "owner")) {
        const n = k === "owner" && numbers.ownerName ? numbers.ownerName : k === "assigner" && numbers.assignerName ? numbers.assignerName : idNumber(v);
        out[k] = typeof v === "number" ? n : String(n);
      } else if (k === "likes" && isSheet && Array.isArray(v)) {
        out[k] = v.map((id) => (typeof id === "number" || typeof id === "string" ? (typeof id === "number" ? idNumber(id) : String(idNumber(id))) : scrub(id)));
      } else if (isSheet && k === "title" && typeof v === "string") {
        out[k] = `Source Sheet ${node.id ?? node.sheetId ?? node._id ?? ""}`.trim();
      } else if (isSheet && k === "topics" && Array.isArray(v)) {
        // Tags the sheet's owner typed (often their own or a teacher's name).
        out[k] = v.map((t) => {
          if (!t || typeof t !== "object") return scrub(t);
          const n = sheetTopics.number(typeof t.slug === "string" ? (t.slug.startsWith("sheet-topic-") ? t.slug : `slug:${t.slug}`) : `tag:${t.asTyped ?? t.en}`);
          const label = `Sheet Topic ${n}`;
          return { ...t, ...("slug" in t ? { slug: `sheet-topic-${n}` } : {}), ...("asTyped" in t ? { asTyped: label } : {}), ...("en" in t ? { en: label } : {}), ...("he" in t ? { he: "" } : {}) };
        });
      } else if (isSheet && (k === "summary" || k === "attribution") && typeof v === "string") {
        out[k] = "";
      } else if (isWebPage && k === "authors" && Array.isArray(v)) {
        out[k] = v.map((a) => (typeof a === "string" ? `Web Author ${webAuthors.number(/^Web Author \d+$/.test(a.trim()) ? a.trim() : a.trim().toLowerCase())}` : scrub(a)));
      } else {
        out[k] = scrub(v);
      }
    }
    return out;
  }

  return { reserve, scrub };
}

/** Every JSON file under a directory, sorted, as paths relative to it. */
export function listJson(dir = ROOT) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".json")) out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

export const serialise = (value) => JSON.stringify(value) + "\n";

/** Scrub a set of files (relative to root). Returns [path, before, after] for each. */
export function scrubFiles(root = ROOT, files = listJson(root)) {
  const s = createScrubber();
  const parsed = files.map((f) => {
    const text = readFileSync(join(root, f), "utf8");
    return [f, text, JSON.parse(text)];
  });
  for (const [, , data] of parsed) s.reserve(data);
  return parsed.map(([f, text, data]) => [f, text, serialise(s.scrub(data))]);
}

/** Personal data left in a string of JSON text: real-looking emails, profile links, profile pictures, owner names. */
export function findPersonalData(text) {
  const hits = [];
  for (const [e] of text.matchAll(EMAIL)) if (!SERVICE_EMAILS.has(e.toLowerCase()) && !/@example\.com$/i.test(e)) hits.push(e);
  for (const [m, slug] of text.matchAll(PROFILE)) if (!/^sheet-author-\d+$/.test(slug)) hits.push(m);
  for (const [m] of text.matchAll(/https?:\/\/(storage\.googleapis\.com\/sefaria-profile-pictures|(www\.|secure\.)?gravatar\.com)\/[^"\s]*/g)) hits.push(m);
  for (const [m, name] of text.matchAll(/"(?:ownerName|viaOwnerName|assignerName|full_name)":"([^"]*)"/g)) if (!/^Sheet Author \d+$/.test(name)) hits.push(m);
  for (const [m, name] of text.matchAll(/"title":"([^"]*)","type":"User"/g)) if (!/^Sheet Author \d+$/.test(name)) hits.push(m);
  return hits;
}

function prune(root) {
  const keep = new Set(readFileSync(KEEP, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  // Checked before anything is deleted: a short or mistyped list must not empty the folder.
  const missing = [...keep].filter((f) => !existsSync(join(root, f)));
  if (!keep.size || missing.length) throw new Error(`keep.txt is empty or names files that are not in ${root}:\n  ${missing.join("\n  ")}`);
  let removed = 0;
  for (const f of listJson(root)) {
    if (!keep.has(f)) {
      rmSync(join(root, f));
      removed++;
    }
  }
  // Empty directories left behind.
  const sweep = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        sweep(p);
        if (!readdirSync(p).length) rmSync(p, { recursive: true });
      }
    }
  };
  sweep(root);
  for (const index of ["api/requests.json", "api/search-requests.json"]) {
    const p = join(root, index);
    if (!existsSync(p)) continue;
    const entries = Object.entries(JSON.parse(readFileSync(p, "utf8"))).filter(([, file]) => existsSync(join(root, "api", file)));
    writeFileSync(p, JSON.stringify(Object.fromEntries(entries), null, 1) + "\n");
  }
  console.log(`pruned ${removed} files not in keep.txt`);
}

function main(argv) {
  const check = argv.includes("--check");
  if (argv.includes("--prune") && !check) prune(ROOT);
  let changed = 0;
  let bytes = 0;
  const leaks = [];
  for (const [f, before, after] of scrubFiles()) {
    bytes += Buffer.byteLength(after);
    for (const hit of findPersonalData(after)) leaks.push(`${f}: ${hit}`);
    if (before === after) continue;
    changed++;
    if (!check) writeFileSync(join(ROOT, f), after);
  }
  if (check) {
    if (changed) console.error(`${changed} fixture files are not scrubbed and minified: run node scripts/fixtures/scrub.mjs`);
    if (leaks.length) console.error(`personal data left after scrubbing:\n  ${leaks.slice(0, 20).join("\n  ")}`);
    if (changed || leaks.length) process.exit(1);
    console.log(`fixtures clean: ${listJson().length} files, ${(bytes / 1e6).toFixed(2)} MB`);
    return;
  }
  if (leaks.length) {
    console.error(`personal data the scrub rules do not cover:\n  ${leaks.slice(0, 20).join("\n  ")}`);
    process.exit(1);
  }
  console.log(`scrubbed ${changed} of ${listJson().length} files; ${(bytes / 1e6).toFixed(2)} MB`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
