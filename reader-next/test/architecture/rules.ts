/**
 * The architecture rules (docs/ARCHITECTURE.md, "Enforced rules") as data, shared by the test and by
 * `scripts/architecture-baseline.mjs`, which writes today's violations to baseline.json. A violation in the baseline is tolerated;
 * a new one fails the test, and so does a baseline entry that has since been fixed (the baseline only shrinks).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

export function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.(test|stories|gen)\.(ts|tsx)$/.test(name) && !/routeTree\.gen\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p);
/** Static imports and re-exports, and dynamic import("…") too (a lazy import must not slip past a boundary). */
const importsOf = (src: string) => [
  ...[...src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!),
  ...[...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]!),
];

/** Every `fetch(...)` call's full argument text (balanced parentheses, so fetch(sameOrigin(url), {…}) is one call). */
function fetchCalls(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\bfetch\(/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    for (; i < src.length && depth; i++) depth += src[i] === "(" ? 1 : src[i] === ")" ? -1 : 0;
    out.push(src.slice(m.index!, i));
  }
  return out;
}

/** Literal colours in CSS declaration values only (a selector like #add or #cafe is not a colour). */
function literalColours(css: string): number {
  let n = 0;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/:([^;{}]+)/g)) n += m[1]!.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d/g)?.length ?? 0;
  return n;
}

/** JSX elements (an HTML tag or the router Link) that set `lang` but not `dir`, as "tag@line". A language without its direction lays
 *  Hebrew out left-to-right inside an English block; LangText / ContentText set both. */
export function langWithoutDir(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)) {
    const name = m[1]!;
    if (!/^[a-z]/.test(name) && name !== "Link") continue;
    let i = m.index! + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    let flat = ""; // the tag's text outside {expressions}
    for (; i < src.length; i++) {
      const c = src[i]!;
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if ((c === '"' || c === "'") || (c === "`" && depth)) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
      if (depth === 0 && c !== "}") flat += c;
    }
    if (/\slang=/.test(flat) && !/\sdir=/.test(flat)) out.push(`${name}@${src.slice(0, m.index).split("\n").length}`);
  }
  return out;
}

export interface Rule {
  id: string;
  why: string;
  /** The file's violation is one count ("3 element(s)") that may only go down, not a list of stable strings. */
  counted?: boolean;
  /** Violations in one file, as short stable strings (an import path, a count). */
  check: (file: string, src: string) => string[];
}

/** UI components receive props: no settings, router, config, analytics, API or workspace imports (ui-boundary). */
const UI_FORBIDDEN = [/^~\/lib\/reader\/settings/, /^@tanstack\/react-router/, /^~\/lib\/config/, /^~\/lib\/analytics/, /^~\/lib\/api/, /^@vendor\/sefaria-toolkit\/client/, /^~\/features\//, /^~\/lib\/workspace/];
/** Only lib adapters see API shapes (adapter-boundary): ui and features import none of the client or the generated types. */
const API_SHAPES = [/^~\/lib\/api(\/|$)/, /^@vendor\/sefaria-toolkit\/client/];

/** An import as a path from the reader-next root ("src/lib/surfaces/load"), or null for a package. */
export function importTarget(file: string, spec: string): string | null {
  if (spec.startsWith("~/")) return `src/${spec.slice(2)}`;
  if (spec.startsWith("@vendor/")) return `vendor/${spec.slice(8)}`;
  if (spec.startsWith("@fixtures/")) return `fixtures/api/${spec.slice(10)}`;
  if (spec.startsWith(".")) return relative(ROOT, resolve(dirname(file), spec));
  return null;
}

/**
 * Surface code (surface-boundary): the loader and host (src/lib/surfaces), their React mounts (src/features/surfaces), the SurfaceHost
 * contract (contract/) and the reference surface the e2e suite serves (e2e/fixtures/social-surface).
 */
const SURFACE_CODE = /^(?:src\/lib\/surfaces|src\/features\/surfaces|contract|e2e\/fixtures\/social-surface)(?:\/|$)/;
/** ...which only itself and the shell may import: the root layout (persistent mount) and the /social routes (page mount). */
const SURFACE_IMPORTERS = /^src\/(?:lib\/surfaces\/|features\/surfaces\/|routes\/__root\.tsx$|routes\/social\.[^/]+\.tsx$)/;

/** The reader state core (reader-state-core-pure) is the future open-source package: no app, React, router or Sefaria imports. */
const CORE_DIR = "src/lib/reader-state/core/";
const CORE_FORBIDDEN_PACKAGES = /^(?:react|react-dom|@tanstack\/|@vendor\/|@fixtures\/)(?:\/|$)?/;

export const RULES: Rule[] = [
  {
    id: "ui-boundary",
    why: "src/ui never reads settings, the router, config, analytics, the API or features",
    check: (f, src) => (rel(f).startsWith("src/ui/") && /\.tsx?$/.test(f) ? importsOf(src).filter((i) => UI_FORBIDDEN.some((r) => r.test(i))) : []),
  },
  {
    id: "adapter-boundary",
    why: "only src/lib adapters see API response shapes",
    check: (f, src) => (/^src\/(ui|features|routes)\//.test(rel(f)) && /\.tsx?$/.test(f) ? importsOf(src).filter((i) => API_SHAPES.some((r) => r.test(i))) : []),
  },
  {
    id: "literal-colours",
    counted: true,
    why: "every colour is a token with light and dark values",
    check: (f, src) => {
      if (!f.endsWith(".css") || /\/tokens\/tokens\.css$/.test(f)) return [];
      const n = literalColours(src);
      return n ? [`${n} literal colour(s)`] : [];
    },
  },
  {
    id: "url-through-router",
    why: "every URL change goes through the router, never history.replaceState/pushState",
    check: (f, src) => (/\.tsx?$/.test(f) ? [...src.matchAll(/\b(?:window\.)?history\.(replaceState|pushState)\s*\(/g)].map((m) => m[1]!) : []),
  },
  {
    id: "writes-through-helper",
    why: "every write to Django goes through src/lib/auth/http.ts (session cookie + CSRF)",
    check: (f, src) =>
      /\.tsx?$/.test(f) && !rel(f).startsWith("src/lib/auth/http.ts") && !rel(f).startsWith("src/server/")
        ? fetchCalls(src).flatMap((c) => [...c.matchAll(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/g)].map((m) => `fetch ${m[1]}`))
        : [],
  },
  {
    id: "surface-boundary",
    why: "nothing in the reader imports surface code (src/lib/surfaces, src/features/surfaces, contract/) except the loader itself and the shell (__root.tsx, the /social routes)",
    check: (f, src) => {
      const r = rel(f);
      if (!/\.tsx?$/.test(f) || SURFACE_IMPORTERS.test(r)) return [];
      return importsOf(src).filter((i) => {
        const t = importTarget(f, i);
        return t !== null && SURFACE_CODE.test(t);
      });
    },
  },
  {
    id: "reader-state-core-pure",
    why: "src/lib/reader-state/core imports nothing from the app (~/), React, the router or Sefaria's vendored code, and nothing outside itself",
    check: (f, src) => {
      const r = rel(f);
      if (!r.startsWith(CORE_DIR) || !/\.tsx?$/.test(f)) return [];
      return importsOf(src).filter((i) => {
        if (i.startsWith("~/") || CORE_FORBIDDEN_PACKAGES.test(i)) return true;
        const t = importTarget(f, i);
        return t !== null && !t.startsWith(CORE_DIR);
      });
    },
  },
  {
    id: "lang-with-dir",
    counted: true,
    why: "an element that sets lang sets dir too — use LangText / ContentText (src/ui/LangText): Hebrew in an LTR block otherwise lays out left-to-right",
    check: (f, src) => (/\.tsx$/.test(f) && /^src\/(ui|features|routes)\//.test(rel(f)) ? (langWithoutDir(src).length ? [`${langWithoutDir(src).length} element(s)`] : []) : []),
  },
];

export type Violations = Record<string, Record<string, string[]>>; // rule → file → violations

export function collect(): Violations {
  const out: Violations = Object.fromEntries(RULES.map((r) => [r.id, {}]));
  for (const f of sourceFiles()) {
    const src = readFileSync(f, "utf8");
    for (const r of RULES) {
      const v = r.check(f, src);
      if (v.length) out[r.id]![rel(f)] = v.sort();
    }
  }
  return out;
}
