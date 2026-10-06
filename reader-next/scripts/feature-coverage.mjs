// Reports which Feature Atlas features (docs/features/features.json) are referenced by `@feature ID` tags
// in tests and stories, flags tags that don't exist in the atlas, and lists untested features per area.
// Usage: node scripts/feature-coverage.mjs [--area text-display] [--tier core] [--unknown] [--json] [--status]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const atlas = JSON.parse(readFileSync(join(root, "docs/features/features.json"), "utf8"));
const byId = new Map(atlas.map((f) => [f.id, f]));

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "docs", "fixtures", "vendor", ".output", "storybook-static"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(test|stories)\.(ts|tsx)$/.test(name)) files.push(p);
  }
})(join(root, "src"));
// End-to-end specs count too: much of the reader's behaviour is only testable in a real browser.
files.push(...(function () { try { return readdirSync(join(root, "e2e")).filter((n) => /\.spec\.ts$/.test(n)).map((n) => join(root, "e2e", n)); } catch { return []; } })());
files.push(...(function () { try { return readdirSync(join(root, "test")).filter((n) => /\.test\./.test(n)).map((n) => join(root, "test", n)); } catch { return []; } })());

const tagged = new Map(); // id -> Set(files)
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/@feature\s+([A-Z]{2,4}-\d{3})/g)) {
    if (!tagged.has(m[1])) tagged.set(m[1], new Set());
    tagged.get(m[1]).add(f.replace(root, ""));
  }
}

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const area = opt("--area"), tier = opt("--tier");

const unknown = [...tagged.keys()].filter((id) => !byId.has(id));
const scope = atlas.filter((f) => (!area || f.area === area) && (!tier || f.tier === tier) && f.status !== "unused");
const covered = scope.filter((f) => tagged.has(f.id));

if (args.includes("--json")) {
  console.log(JSON.stringify({ covered: covered.map((f) => f.id), unknown }, null, 2));
  process.exit(0);
}
console.log(`Atlas features in scope: ${scope.length}   covered by a tagged test/story: ${covered.length} (${Math.round((100 * covered.length) / scope.length)}%)`);
if (unknown.length) console.log(`\nUNKNOWN TAGS (not in the atlas; fix the tag):\n  ${unknown.join(", ")}`);
if (args.includes("--unknown")) process.exit(unknown.length ? 1 : 0);

// Rebuild status: rebuild-status.json decides; otherwise a tagged test means done; otherwise todo (n/a for retired/unused).
let RB = {};
try { RB = JSON.parse(readFileSync(join(root, "docs/features/rebuild-status.json"), "utf8")); } catch {}
const rbStatus = (f) => RB[f.id]?.status ?? (tagged.has(f.id) ? "done" : f.tier === "retire" || f.status === "unused" || f.status === "branch-only" ? "n/a" : "todo");
if (args.includes("--status")) {
  const KEYS = ["done", "partial", "todo", "replaced", "deferred", "n/a"];
  const rows = new Map();
  for (const f of atlas.filter((f) => !tier || f.tier === tier)) {
    const r = rows.get(f.area) ?? Object.fromEntries(KEYS.map((k) => [k, 0]));
    r[rbStatus(f)]++; rows.set(f.area, r);
  }
  console.log(`Rebuild status by area${tier ? ` (tier ${tier})` : ""}\n${"area".padEnd(18)}${KEYS.map((k) => k.padStart(9)).join("")}`);
  for (const [a, r] of [...rows].sort((x, y) => y[1].todo - x[1].todo)) console.log(a.padEnd(18) + KEYS.map((k) => String(r[k]).padStart(9)).join(""));
  process.exit(unknown.length ? 1 : 0);
}

const byArea = new Map();
for (const f of atlas.filter((f) => f.status !== "unused")) {
  const a = byArea.get(f.area) ?? { total: 0, covered: 0 };
  a.total++; if (tagged.has(f.id)) a.covered++;
  byArea.set(f.area, a);
}
console.log("\nArea                  covered / total");
for (const [a, v] of [...byArea].sort((x, y) => y[1].covered - x[1].covered)) console.log(`${a.padEnd(20)}  ${String(v.covered).padStart(3)} / ${v.total}`);
process.exit(unknown.length ? 1 : 0);
