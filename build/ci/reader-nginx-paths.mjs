#!/usr/bin/env node
// The nginx side of "which paths are Django's" for the new reader, generated from the one source of truth:
// DJANGO_PREFIXES in reader-next/src/lib/routing/django-paths.ts. With nodejs.mode "optin" (and "reader"), nginx sends these paths
// straight to Varnish instead of through the reader client (which would only pass them on), and with them the site's well-known
// files (favicon, manifests, llms.txt, /.well-known/*), which the client would first try to render.
//
//   node --experimental-strip-types build/ci/reader-nginx-paths.mjs           write helm-chart/sefaria/templates/_reader-django-paths.tpl
//   node --experimental-strip-types build/ci/reader-nginx-paths.mjs --check   exit 1 if that file is stale or the regex disagrees with the client
//
// Not in the regex:
//  - "api" and "static": nginx already has its own locations for them (/api/, /api/search/, /static/…); a regex location would
//    take precedence over those prefix locations and change their behaviour.
//  - the pages the client renders under a Django prefix (django-paths.ts CLIENT_UNDER_DJANGO_PREFIX_RE: /activity/<ref>/<lang>/<v>).
//  - LIBRARY_ONLY_PREFIXES: they are the client's on the Library host (the only host this location is used on); the Voices server
//    block never sends anything to the reader.
// Runs with Node 22 (--experimental-strip-types imports the .ts file directly; no dependency).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(ROOT, "reader-next/src/lib/routing/django-paths.ts");
const OUT = join(ROOT, "helm-chart/sefaria/templates/_reader-django-paths.tpl");

/** Prefixes nginx routes with locations of its own (see above). */
const NGINX_OWN = new Set(["api", "static"]);
/** Files at the site root that are always Django's (or Varnish's), never a reader page. */
const WELL_KNOWN_FILES = ["favicon.ico", "site.webmanifest", "manifest.json", "llms.txt"];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** CLIENT_UNDER_DJANGO_PREFIX_RE's source, read from the file (it is not exported); null when the file no longer has one. */
function clientUnderDjangoPrefix(text) {
  const m = /const CLIENT_UNDER_DJANGO_PREFIX_RE = \/(.+)\/;\s*$/m.exec(text);
  return m ? m[1].replace(/\\\//g, "/") : null;
}

/**
 * django-paths.ts as plain Node can import it: the client's "~/…" path alias means nothing to Node, so the file and each module it
 * imports through the alias are copied into a temporary folder with those imports rewritten to the copies (one level: an aliased
 * module that itself imports through the alias is an error here, so this cannot silently go stale).
 */
async function importSource() {
  const tmp = mkdtempSync(join(tmpdir(), "reader-nginx-paths-"));
  const alias = /from "~\/([^"]+)"/g;
  const rewrite = (text) =>
    text.replace(alias, (_, mod) => {
      const name = mod.replace(/\//g, "__") + ".ts";
      const body = readFileSync(join(ROOT, "reader-next/src", `${mod}.ts`), "utf8");
      if (alias.test(body)) throw new Error(`${mod}.ts imports through "~/" too: teach build/ci/reader-nginx-paths.mjs to follow it`);
      alias.lastIndex = 0;
      writeFileSync(join(tmp, name), body);
      return `from "./${name}"`;
    });
  writeFileSync(join(tmp, "django-paths.ts"), rewrite(readFileSync(SOURCE, "utf8")));
  // the static-page manifest too (django-paths.ts uses it but does not export it): which static pages the client renders
  writeFileSync(join(tmp, "pages.ts"), readFileSync(join(ROOT, "reader-next/src/lib/static-page/pages.ts"), "utf8"));
  try {
    const paths = await import(pathToFileURL(join(tmp, "django-paths.ts")).href);
    const pages = await import(pathToFileURL(join(tmp, "pages.ts")).href);
    return { ...paths, STATIC_PAGE_NAMES: pages.STATIC_PAGE_NAMES, rendersStaticPage: pages.rendersStaticPage };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function build() {
  const text = readFileSync(SOURCE, "utf8");
  const mod = await importSource();
  const prefixes = mod.DJANGO_PREFIXES.filter((p) => !NGINX_OWN.has(p));
  const under = clientUnderDjangoPrefix(text);
  // Static pages the client renders whose name is also a Django prefix (/linker: Django's prefix for /linker.js and /linker-editor,
  // the client's static page itself): the path alone, with an optional slash, stays the client's.
  const ownStatic = (mod.STATIC_PAGE_NAMES ?? []).filter((n) => mod.rendersStaticPage?.(n) && prefixes.includes(n));
  // the client's exceptions, anchored after the leading "/" (PCRE and JS read this subset the same way)
  const exceptions = [under ? under.replace(/^\^\//, "") : null, ownStatic.length ? `(?:${ownStatic.map(esc).join("|")})/?$` : null].filter(Boolean);
  const exception = exceptions.map((e) => `(?!${e})`).join("");
  const regex =
    `^/(?:${exception}(?:${prefixes.map(esc).join("|")})(?:[/.]|$)` +
    `|(?:${WELL_KNOWN_FILES.map(esc).join("|")})$` +
    `|\\.well-known/)`;
  if (regex.includes('"') || regex.includes("{{") || regex.includes("}}")) throw new Error(`regex cannot be quoted for nginx/Helm: ${regex}`);
  const file = `{{/*
GENERATED by build/ci/reader-nginx-paths.mjs from ${relative(ROOT, SOURCE)} (DJANGO_PREFIXES). Do not edit by hand:
run \`node --experimental-strip-types build/ci/reader-nginx-paths.mjs\` after changing DJANGO_PREFIXES. CI runs it with --check.
The paths nginx sends straight to Varnish in nodejs.mode "optin"/"reader" (conf/nginx.template.conf.tpl): Django's prefixes except
${[...NGINX_OWN].map((p) => `"${p}"`).join(" and ")} (nginx has locations of their own) and the pages the reader renders under a Django prefix, plus
${WELL_KNOWN_FILES.join(", ")} and /.well-known/.
*/}}
{{- define "sefaria.readerDjangoPathRegex" -}}
${regex}
{{- end -}}
`;
  return { file, regex, mod, prefixes };
}

/** The regex must never send to Varnish a page the client renders, and must catch every prefix it claims. */
export function selfTest({ regex, mod, prefixes }) {
  const re = new RegExp(regex);
  const host = "www.sefaria.org";
  const problems = [];
  const samples = ["/", "/Genesis.1", "/Genesis.1.1", "/texts", "/texts/Tanakh", "/search", "/login", "/register", "/password/reset/confirm/x/set-password/",
    "/translations/de", "/calendars", "/compare/Genesis.1/", "/topics", "/topics/light", "/saved", "/history", "/activity", "/activity/leaderboard",
    "/activity/Genesis.1/en/The_Koren_Jerusalem_Bible", "/activity/Genesis.1/he/Miqra_according_to_the_Masorah/2", "/Shabbat.2a", "/Rashi_on_Genesis.1.1"];
  for (const p of mod.DJANGO_PREFIXES) samples.push(`/${p}`, `/${p}/`, `/${p}/x`, `/${p}.js`, `/${p}x`, `/x${p}`);
  for (const path of samples) {
    if (re.test(path) && !mod.isDjangoPage(path, host) && !WELL_KNOWN_FILES.some((f) => path === `/${f}`)) problems.push(`would bypass the client for its own page ${path}`);
  }
  for (const p of prefixes) for (const path of [`/${p}`, `/${p}/x`]) {
    if (mod.isDjangoPage(path, host) && !re.test(path)) problems.push(`misses Django's ${path}`);
  }
  for (const f of WELL_KNOWN_FILES) if (!re.test(`/${f}`)) problems.push(`misses /${f}`);
  if (!re.test("/.well-known/apple-app-site-association")) problems.push("misses /.well-known/");
  return problems;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const built = await build();
  const problems = selfTest(built);
  if (problems.length) {
    console.error(`reader-nginx-paths: the generated regex disagrees with ${relative(ROOT, SOURCE)}:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {}
    if (current !== built.file) {
      console.error(`reader-nginx-paths: ${relative(ROOT, OUT)} is stale. Run: node --experimental-strip-types build/ci/reader-nginx-paths.mjs`);
      process.exit(1);
    }
    console.log(`reader-nginx-paths: ${relative(ROOT, OUT)} is up to date (${built.prefixes.length} prefixes)`);
  } else {
    writeFileSync(OUT, built.file);
    console.log(`reader-nginx-paths: wrote ${relative(ROOT, OUT)} (${built.prefixes.length} prefixes)`);
  }
}
