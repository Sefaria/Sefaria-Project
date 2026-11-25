// The fixture scrub (scripts/fixtures/scrub.mjs) applied to the e2e cassette's recordings, so a bundle never carries personal data
// about Sefaria users. `bundle.mjs pack` runs it before hashing.
//
//   node scripts/cassette/scrub.mjs           scrub e2e/.cassette (or E2E_CASSETTE_DIR) in place
//   node scripts/cassette/scrub.mjs --check   change nothing; exit 1 if any recording is unscrubbed or still looks personal
//
// A recording is gzip of one JSON header line ({method, url, status, headers}) and the raw response body (scripts/api-cassette.mjs).
// Replay finds it by the request alone (its file name), so only the body changes, and only when it is JSON and the scrub changes
// it: a recording with nothing to scrub keeps its bytes. One scrubber covers every recording, so a person has the same placeholder
// in all of them, and a second run changes nothing. Non-JSON bodies (HTML pages, scripts) are left alone.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { createScrubber, findPersonalData, findPersonalKeys } from "../fixtures/scrub.mjs";

// The same directory and file rule as bundle.mjs (which imports this module).
const DIR = process.env.E2E_CASSETTE_DIR || new URL("../../e2e/.cassette", import.meta.url).pathname;
const recordings = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".gz") && !f.startsWith("._")).sort() : []);

function parse(dir, file) {
  const raw = gunzipSync(readFileSync(join(dir, file)));
  const nl = raw.indexOf(10);
  const header = raw.subarray(0, nl + 1);
  const body = raw.subarray(nl + 1);
  let type = "";
  try {
    type = nl > 0 ? (JSON.parse(header.toString()).headers?.["content-type"] ?? "") : "";
  } catch {
    // not a recording api-cassette.mjs wrote: left as it is
  }
  let json;
  if (/json/i.test(type) && body.length) {
    try {
      json = JSON.parse(body.toString("utf8"));
    } catch {
      json = undefined;
    }
  }
  return { file, header, json };
}

/** Scrub every recording in `dir`. Returns the names it changed (or would change, with check) and any personal data left. */
export function scrubCassette(dir = DIR, { check = false } = {}) {
  const s = createScrubber();
  const items = recordings(dir).map((f) => parse(dir, f)).filter((r) => r.json !== undefined);
  for (const r of items) s.reserve(r.json);
  const changed = [];
  const leaks = [];
  for (const r of items) {
    const scrubbed = s.scrub(r.json);
    const text = JSON.stringify(scrubbed);
    for (const hit of [...findPersonalData(text), ...findPersonalKeys(scrubbed)]) leaks.push(`${r.file}: ${hit}`);
    if (text === JSON.stringify(r.json)) continue;
    changed.push(r.file);
    if (!check) writeFileSync(join(dir, r.file), gzipSync(Buffer.concat([r.header, Buffer.from(text)])));
  }
  return { changed, leaks, recordings: items.length };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  const check = process.argv.includes("--check");
  const dir = DIR;
  const { changed, leaks, recordings: n } = scrubCassette(dir, { check });
  if (leaks.length) console.error(`personal data the scrub rules do not cover:\n  ${leaks.slice(0, 20).join("\n  ")}`);
  if (check && changed.length) console.error(`${changed.length} recordings are not scrubbed: run node scripts/cassette/scrub.mjs`);
  if (leaks.length || (check && changed.length)) process.exit(1);
  console.log(check ? `cassette clean: ${n} JSON recordings` : `scrubbed ${changed.length} of ${n} JSON recordings in ${dir}`);
}
