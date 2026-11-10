// CI budgets (LAUNCH_PLAN T-H04): the JS and CSS a reader page (/Genesis.1, the "/$" route) loads up front, measured from the
// `npm run build` output and held against the committed baseline (scripts/budgets/baseline.json).
//
//   npm run build && node scripts/budgets/measure.mjs            compare; exit 1 when a number grew beyond the tolerance
//   npm run build && node scripts/budgets/measure.mjs --write    measure and write the baseline (after a deliberate change)
//
// "Up front" is what the server's page links before any code runs: TanStack Start's manifest (dist/server/assets/
// _tanstack-start-manifest*.js) lists, per route, its stylesheets (`css`) and its module preloads and entry scripts (`preloads`,
// `scripts`); a reader page matches __root__ and "/$". The root's own stylesheets imported with `?url` (tokens, fonts, base:
// src/routes/__root.tsx head links) are not in that manifest: they are the "/assets/*.css" names written into the server's root chunk
// (router-*.js, __root-*.js). Checked against a server-rendered /Genesis.1 on 2026-11-10: the same 56 scripts and 17 stylesheets.
// Sizes are bytes on disk and gzip -9 bytes (what the wire roughly carries).
// Tolerance: TOLERANCE (2%) of the baseline, so a small change passes and a real regression does not; shrinking always passes and
// prints the --write command to lock the gain in.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const HERE = new URL("../../", import.meta.url).pathname;
export const TOLERANCE = 0.02;
/** The pages held to a budget: name → the manifest routes a server render of it links. */
export const PAGES = { "reader page (/Genesis.1)": ["__root__", "/$"] };

export async function readManifest(dist) {
  const dir = join(dist, "server/assets");
  const file = existsSync(dir) && readdirSync(dir).find((f) => f.startsWith("_tanstack-start-manifest") && f.endsWith(".js"));
  if (!file) throw new Error(`no TanStack Start manifest in ${dir}: run \`npm run build\` first`);
  const mod = await import(pathToFileURL(join(dir, file)).href);
  return mod.tsrStartManifest().routes;
}

/** Stylesheets the root route links by URL (`import x from "….css?url"`), as named in the server's root chunks. */
export function rootUrlStylesheets(dist) {
  const dir = join(dist, "server/assets");
  const found = new Set();
  for (const f of readdirSync(dir).filter((f) => /^(router|__root)-.*\.js$/.test(f))) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/["'](\/assets\/[\w.-]+\.css)["']/g)) found.add(m[1]);
  }
  return [...found];
}

/** The initial assets of `routes`: unique stylesheet and script paths (plus `extraCss`, the root's ?url stylesheets). */
export function initialAssets(manifest, routes, extraCss = []) {
  const css = new Set(extraCss);
  const js = new Set();
  for (const id of routes) {
    const r = manifest[id];
    if (!r) throw new Error(`route ${id} is not in the build's manifest (renamed? update PAGES in scripts/budgets/measure.mjs)`);
    for (const c of r.css ?? []) css.add(c);
    for (const p of r.preloads ?? []) js.add(p);
    for (const s of r.scripts ?? []) if (s?.attrs?.src) js.add(s.attrs.src);
  }
  return { css: [...css].sort(), js: [...js].sort() };
}

function sizes(dist, paths) {
  let raw = 0;
  let gzip = 0;
  for (const p of paths) {
    const buf = readFileSync(join(dist, "client", p));
    raw += buf.length;
    gzip += gzipSync(buf, { level: 9 }).length;
  }
  return { files: paths.length, raw, gzip };
}

export async function measure(dist = join(HERE, "dist")) {
  const manifest = await readManifest(dist);
  const out = {};
  for (const [page, routes] of Object.entries(PAGES)) {
    const a = initialAssets(manifest, routes, routes.includes("__root__") ? rootUrlStylesheets(dist) : []);
    out[page] = { routes, js: sizes(dist, a.js), css: sizes(dist, a.css) };
  }
  return out;
}

/** Each number that grew beyond the tolerance, and each that shrank (to report). */
export function compare(baseline, current, tolerance = TOLERANCE) {
  const over = [];
  const under = [];
  const rows = [];
  for (const [page, cur] of Object.entries(current)) {
    const base = baseline.pages?.[page];
    if (!base) {
      over.push(`${page}: not in the baseline (run --write)`);
      continue;
    }
    for (const kind of ["js", "css"]) {
      for (const unit of ["raw", "gzip"]) {
        const b = base[kind][unit];
        const c = cur[kind][unit];
        const limit = Math.round(b * (1 + tolerance));
        const delta = c - b;
        rows.push({ page, what: `${kind} ${unit}`, baseline: b, current: c, delta, limit });
        if (c > limit) over.push(`${page} ${kind} (${unit}): ${c} bytes, baseline ${b}, limit ${limit} (+${(100 * delta / b).toFixed(1)}%)`);
        else if (c < b) under.push(`${page} ${kind} (${unit}): ${c} < ${b}`);
      }
    }
  }
  return { over, under, rows };
}

const BASELINE = join(HERE, "scripts/budgets/baseline.json");
const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    const current = await measure();
    if (process.argv.includes("--write")) {
      writeFileSync(BASELINE, JSON.stringify({ tolerance: TOLERANCE, measured: new Date().toISOString().slice(0, 10), pages: current }, null, 2) + "\n");
      console.log(`wrote ${BASELINE}`);
      for (const [page, m] of Object.entries(current)) console.log(`  ${page}: JS ${m.js.files} files ${m.js.raw} B (gzip ${m.js.gzip}), CSS ${m.css.files} files ${m.css.raw} B (gzip ${m.css.gzip})`);
    } else {
      const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
      const { over, under, rows } = compare(baseline, current, baseline.tolerance ?? TOLERANCE);
      for (const r of rows) console.log(`${r.page.padEnd(28)} ${r.what.padEnd(9)} ${String(r.current).padStart(9)} B  baseline ${String(r.baseline).padStart(9)}  limit ${String(r.limit).padStart(9)}  ${r.delta >= 0 ? "+" : ""}${r.delta}`);
      if (over.length) {
        console.error(`\nover budget:\n  ${over.join("\n  ")}\nIf the growth is deliberate, run \`npm run build && node scripts/budgets/measure.mjs --write\` and commit the baseline with the reason.`);
        process.exit(1);
      }
      if (under.length) console.log(`\nsmaller than the baseline; lock the gain in with \`node scripts/budgets/measure.mjs --write\`.`);
      console.log("budgets: PASS");
    }
  } catch (e) {
    console.error(`budgets: ${e.message}`);
    process.exit(1);
  }
}
