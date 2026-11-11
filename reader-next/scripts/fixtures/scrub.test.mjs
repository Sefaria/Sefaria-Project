// node --test scripts/fixtures/scrub.test.mjs — the fixture scrub: personal data out, the same person numbered the same in every
// file, public library data untouched, a second run a no-op, and --check failing on an unscrubbed tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPersonalData, scrubFiles } from "./scrub.mjs";

const SCRIPT = new URL("./scrub.mjs", import.meta.url).pathname;

const sheet = (id, owner, name, slug, extra = {}) => ({
  id: String(id),
  sheetUrl: `/sheets/${id}`,
  title: `${name}'s sheet on Genesis`,
  owner,
  ownerName: name,
  ownerProfileUrl: `/profile/${slug}`,
  ownerImageUrl: `https://storage.googleapis.com/sefaria-profile-pictures/${slug}-1-small.png`,
  viaOwnerName: null,
  viaOwnerProfileUrl: null,
  attribution: `<p>Source Sheet by <a class="userLink" href="/profile/${slug}">${name}</a></p><p><em>${slug}@gmail.com</em></p>`,
  summary: `Notes by ${name}`,
  topics: [{ slug: slug, asTyped: name, en: name, he: "" }],
  likes: [owner],
  anchorRef: "Genesis 1:1",
  ...extra,
});

function tree() {
  const root = mkdtempSync(join(tmpdir(), "scrub-test-"));
  mkdirSync(join(root, "api", "a"), { recursive: true });
  mkdirSync(join(root, "api", "b"), { recursive: true });
  const related = {
    sheets: [sheet(1, 101, "Ada Reader", "ada-reader"), sheet(2, 202, "Ben Writer", "ben-writer", { viaOwnerName: "Ada Reader", viaOwnerProfileUrl: "/profile/ada-reader" })],
    topics: [{ topic: "light", title: { en: "Light", he: "אור" } }],
    webpages: [{ url: "https://example.org/x", domain: "example.org", linkerHits: 3, title: "A dvar Torah", authors: ["Cara Author"] }],
  };
  writeFileSync(join(root, "api", "a", "related.json"), JSON.stringify(related, null, 2));
  const name = {
    completions: ["Genesis", "Ben Writer"],
    completion_objects: [
      { title: "Genesis", type: "ref", key: "Genesis" },
      { title: "Ben Writer", type: "User", key: "ben-writer", pic: "https://storage.googleapis.com/sefaria-profile-pictures/ben-writer-2-small.png" },
    ],
  };
  writeFileSync(join(root, "api", "b", "name.json"), JSON.stringify(name, null, 2));
  // A publisher's address, built so a grep of the tree for real addresses does not find this test.
  const publisher = ["editor", "publisher.org"].join("@");
  const version = { versionTitle: "The Koren Jerusalem Bible", versionNotes: `Write to ${publisher} or hello@sefaria.org`, text: ["In the beginning"] };
  writeFileSync(join(root, "api", "b", "v3-texts.json"), JSON.stringify(version, null, 2));
  return root;
}

const scrubbed = (root) => Object.fromEntries(scrubFiles(root).map(([f, , after]) => [f, JSON.parse(after)]));

test("people become numbered placeholders, the same number in every file and field", () => {
  const out = scrubbed(tree());
  const [ada, ben] = out["api/a/related.json"].sheets;
  assert.equal(ada.ownerName, "Sheet Author 1");
  assert.equal(ada.ownerProfileUrl, "/profile/sheet-author-1");
  assert.equal(ada.owner, 1);
  assert.deepEqual(ada.likes, [1]);
  assert.equal(ada.ownerImageUrl, null);
  assert.equal(ben.ownerName, "Sheet Author 2");
  assert.equal(ben.viaOwnerName, "Sheet Author 1");
  assert.equal(ben.viaOwnerProfileUrl, "/profile/sheet-author-1");
  const user = out["api/b/name.json"].completion_objects[1];
  assert.deepEqual(user, { title: "Sheet Author 2", type: "User", key: "sheet-author-2", pic: null });
  assert.deepEqual(out["api/b/name.json"].completions, ["Genesis", "Sheet Author 2"]);
});

test("a sheet's own text, its tags and web page authors are replaced; public data is kept", () => {
  const out = scrubbed(tree());
  const ada = out["api/a/related.json"].sheets[0];
  assert.equal(ada.title, "Source Sheet 1");
  assert.equal(ada.summary, "");
  assert.equal(ada.attribution, "");
  assert.deepEqual(ada.topics, [{ slug: "sheet-topic-1", asTyped: "Sheet Topic 1", en: "Sheet Topic 1", he: "" }]);
  assert.equal(ada.anchorRef, "Genesis 1:1");
  assert.deepEqual(out["api/a/related.json"].topics, [{ topic: "light", title: { en: "Light", he: "אור" } }]);
  assert.deepEqual(out["api/a/related.json"].webpages[0].authors, ["Web Author 1"]);
  assert.equal(out["api/a/related.json"].webpages[0].title, "A dvar Torah");
  const v = out["api/b/v3-texts.json"];
  assert.equal(v.versionTitle, "The Koren Jerusalem Bible");
  assert.equal(v.versionNotes, "Write to user1@example.com or hello@sefaria.org");
});

test("the output is minified, holds no personal data, and a second run changes nothing", () => {
  const root = tree();
  const first = scrubFiles(root);
  for (const [f, before, after] of first) {
    assert.ok(findPersonalData(before).length > 0 || f.endsWith("v3-texts.json"), `${f} should start with personal data`);
    assert.deepEqual(findPersonalData(after), [], f);
    assert.equal(after.split("\n").length, 2, `${f} is one line`);
    writeFileSync(join(root, f), after);
  }
  for (const [f, before, after] of scrubFiles(root)) assert.equal(after, before, `${f} changed on the second run`);
});

test("a new person added to a scrubbed tree gets the next free number", () => {
  const root = tree();
  for (const [f, , after] of scrubFiles(root)) writeFileSync(join(root, f), after);
  const p = join(root, "api", "a", "related.json");
  const related = JSON.parse(readFileSync(p, "utf8"));
  related.sheets.unshift(sheet(3, 303, "Dana New", "dana-new"));
  writeFileSync(p, JSON.stringify(related));
  const sheets = scrubbed(root)["api/a/related.json"].sheets;
  assert.deepEqual(sheets.map((s) => s.ownerName), ["Sheet Author 3", "Sheet Author 1", "Sheet Author 2"]);
});

test("--check fails on an unscrubbed tree and passes once it is scrubbed", () => {
  const root = tree();
  const check = () => spawnSync(process.execPath, [SCRIPT, "--check"], { env: { ...process.env, FIXTURES_DIR: root }, encoding: "utf8" });
  const before = check();
  assert.equal(before.status, 1);
  assert.match(before.stderr, /not scrubbed and minified/);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, FIXTURES_DIR: root }, encoding: "utf8" }).status, 0);
  const after = check();
  assert.equal(after.status, 0, after.stderr);
});
