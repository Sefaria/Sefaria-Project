// node --test scripts/cassette/scrub.test.mjs — the cassette scrub: JSON bodies lose personal data under the same file name and header,
// everything else keeps its bytes, a second run is a no-op, --check fails until it has run, and pack scrubs before it hashes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scrubCassette } from "./scrub.mjs";

const SCRUB = new URL("./scrub.mjs", import.meta.url).pathname;
const BUNDLE = new URL("./bundle.mjs", import.meta.url).pathname;

const recording = (url, type, body) =>
  gzipSync(Buffer.concat([Buffer.from(JSON.stringify({ method: "GET", url, status: 200, headers: { "content-type": type } }) + "\n"), Buffer.from(body)]));
const read = (dir, f) => {
  const raw = gunzipSync(readFileSync(join(dir, f))).toString();
  const nl = raw.indexOf("\n");
  return { header: JSON.parse(raw.slice(0, nl)), body: raw.slice(nl + 1) };
};

function cassette() {
  const root = mkdtempSync(join(tmpdir(), "cassette-scrub-test-"));
  const dir = join(root, "cassette");
  mkdirSync(dir);
  const sheet = { id: "7", sheetUrl: "/sheets/7", title: "Ada's sheet", owner: 41, ownerName: "Ada Reader", ownerProfileUrl: "/profile/ada-reader", ownerImageUrl: "https://storage.googleapis.com/sefaria-profile-pictures/ada-reader-1-small.png" };
  writeFileSync(join(dir, "related.gz"), recording("/api/related/Genesis%201", "application/json", JSON.stringify({ sheets: [sheet] }, null, 2)));
  writeFileSync(join(dir, "links.gz"), recording("/api/links/Genesis%201", "application/json", JSON.stringify([{ ref: "Rashi on Genesis 1:1:1", sheet: { ...sheet, id: "8", sheetUrl: "/sheets/8" } }])));
  writeFileSync(join(dir, "text.gz"), recording("/api/v3/texts/Genesis%201", "application/json", '{"versions": [{"versionTitle": "Tanakh", "text": ["In the beginning"]}]}'));
  writeFileSync(join(dir, "page.gz"), recording("/topics", "text/html; charset=utf-8", '<a href="/profile/ada-reader">Ada Reader</a>'));
  return { root, dir, env: { ...process.env, E2E_CASSETTE_DIR: dir, E2E_CASSETTE_LOCK: join(root, "cassette.lock") } };
}

test("JSON bodies are scrubbed with one numbering across recordings; headers, names and other bodies are kept", () => {
  const { dir } = cassette();
  const before = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(join(dir, f))]));
  const { changed, leaks } = scrubCassette(dir);
  assert.deepEqual(changed.sort(), ["links.gz", "related.gz"]);
  assert.deepEqual(leaks, []);
  assert.deepEqual(readdirSync(dir).sort(), Object.keys(before).sort());
  const related = read(dir, "related.gz");
  assert.deepEqual(related.header, { method: "GET", url: "/api/related/Genesis%201", status: 200, headers: { "content-type": "application/json" } });
  const s = JSON.parse(related.body).sheets[0];
  assert.deepEqual([s.ownerName, s.ownerProfileUrl, s.ownerImageUrl, s.owner, s.title], ["Sheet Author 1", "/profile/sheet-author-1", null, 1, "Source Sheet 7"]);
  assert.equal(JSON.parse(read(dir, "links.gz").body)[0].sheet.ownerName, "Sheet Author 1");
  // nothing to scrub, or not JSON: the same bytes
  assert.ok(readFileSync(join(dir, "text.gz")).equals(before["text.gz"]));
  assert.ok(readFileSync(join(dir, "page.gz")).equals(before["page.gz"]));
  assert.deepEqual(scrubCassette(dir).changed, []);
});

test("--check fails until the cassette is scrubbed", () => {
  const { env } = cassette();
  const check = () => spawnSync(process.execPath, [SCRUB, "--check"], { env, encoding: "utf8" });
  const first = check();
  assert.equal(first.status, 1);
  assert.match(first.stderr, /2 recordings are not scrubbed/);
  assert.equal(spawnSync(process.execPath, [SCRUB], { env, encoding: "utf8" }).status, 0);
  assert.equal(check().status, 0);
});

test("pack scrubs the recordings before it hashes them", () => {
  const { root, dir, env } = cassette();
  const packed = spawnSync(process.execPath, [BUNDLE, "pack", "--out", join(root, "out")], { env, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  assert.match(packed.stdout, /scrubbed 2 of 3 JSON recordings/);
  assert.equal(JSON.parse(read(dir, "related.gz").body).sheets[0].ownerName, "Sheet Author 1");
  assert.equal(spawnSync(process.execPath, [BUNDLE, "verify"], { env, encoding: "utf8" }).status, 0);
});
