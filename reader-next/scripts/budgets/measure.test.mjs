// node --test scripts/budgets/measure.test.mjs — the budget measure on a fake build, and the comparison's tolerance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compare, initialAssets, measure, rootUrlStylesheets } from "./measure.mjs";

function fakeBuild() {
  const dist = mkdtempSync(join(tmpdir(), "budgets-"));
  mkdirSync(join(dist, "server/assets"), { recursive: true });
  mkdirSync(join(dist, "client/assets"), { recursive: true });
  const routes = {
    __root__: { css: ["/assets/root.css"], preloads: ["/assets/entry.js", "/assets/shared.js"], scripts: [{ attrs: { src: "/assets/entry.js" } }] },
    "/$": { css: ["/assets/reader.css"], preloads: ["/assets/reader.js", "/assets/shared.js"] },
    "/search": { preloads: ["/assets/search.js"] },
  };
  writeFileSync(join(dist, "server/assets/_tanstack-start-manifest_v-x.js"), `var m = () => ({ routes: ${JSON.stringify(routes)} });\nexport { m as tsrStartManifest };\n`);
  writeFileSync(join(dist, "server/assets/router-abc.js"), `const tokens = "/assets/tokens.css"; const img = "/assets/logo.svg";`);
  for (const [f, n] of [["entry.js", 1000], ["shared.js", 500], ["reader.js", 2000], ["search.js", 9999], ["root.css", 300], ["reader.css", 200], ["tokens.css", 100]])
    writeFileSync(join(dist, "client/assets", f), "x".repeat(n));
  return dist;
}

test("a reader page's initial assets: the root's and the splat route's, once each, with the root's ?url stylesheets", async () => {
  const dist = fakeBuild();
  assert.deepEqual(rootUrlStylesheets(dist), ["/assets/tokens.css"]);
  const m = await measure(dist);
  const page = m["reader page (/Genesis.1)"];
  assert.equal(page.js.files, 3);
  assert.equal(page.js.raw, 3500); // entry + shared + reader; search.js is another route's
  assert.equal(page.css.files, 3);
  assert.equal(page.css.raw, 600);
  assert.throws(() => initialAssets({ __root__: {} }, ["__root__", "/$"]), /not in the build's manifest/);
});

test("growth within the tolerance passes, beyond it fails; shrinking is reported", () => {
  const base = { pages: { p: { js: { raw: 1000, gzip: 400 }, css: { raw: 100, gzip: 50 } } } };
  const at = (js, css = 100) => ({ p: { js: { raw: js, gzip: 400 }, css: { raw: css, gzip: 50 } } });
  assert.deepEqual(compare(base, at(1020), 0.02).over, []);
  assert.match(compare(base, at(1021), 0.02).over.join(), /p js \(raw\): 1021 bytes/);
  assert.match(compare(base, at(1000, 90), 0.02).under.join(), /css \(raw\): 90 < 100/);
  assert.match(compare({ pages: {} }, at(1000)).over.join(), /not in the baseline/);
});
