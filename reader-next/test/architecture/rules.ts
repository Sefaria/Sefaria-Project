/**
 * The architecture rules (TARGET_ARCHITECTURE §5, CODE_REVIEW §3.1) as data, shared by the test and by
 * `scripts/architecture-baseline.mjs`, which writes today's violations to baseline.json. A violation in the baseline is tolerated;
 * a new one fails the test, and so does a baseline entry that has since been fixed (the baseline only shrinks).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

export interface Rule {
  id: string;
  why: string;
  /** Violations in one file, as short stable strings (an import path, a count). */
  check: (file: string, src: string) => string[];
}

/** UI components receive props: no settings, router, config, analytics, API or workspace imports (rule 2). */
const UI_FORBIDDEN = [/^~\/lib\/reader\/settings/, /^@tanstack\/react-router/, /^~\/lib\/config/, /^~\/lib\/analytics/, /^~\/lib\/api/, /^@vendor\/sefaria-toolkit\/client/, /^~\/features\//, /^~\/lib\/workspace/];
/** Only lib adapters see API shapes (rule 1): ui and features import none of the client or the generated types. */
const API_SHAPES = [/^~\/lib\/api(\/|$)/, /^@vendor\/sefaria-toolkit\/client/];

export const RULES: Rule[] = [
  {
    id: "ui-boundary",
    why: "src/ui never reads settings, the router, config, analytics, the API or features (TARGET_ARCHITECTURE §5 rule 2)",
    check: (f, src) => (rel(f).startsWith("src/ui/") && /\.tsx?$/.test(f) ? importsOf(src).filter((i) => UI_FORBIDDEN.some((r) => r.test(i))) : []),
  },
  {
    id: "adapter-boundary",
    why: "only src/lib adapters see API response shapes (TARGET_ARCHITECTURE §5 rule 1)",
    check: (f, src) => (/^src\/(ui|features|routes)\//.test(rel(f)) && /\.tsx?$/.test(f) ? importsOf(src).filter((i) => API_SHAPES.some((r) => r.test(i))) : []),
  },
  {
    id: "literal-colours",
    why: "every colour is a token with light and dark values (TARGET_ARCHITECTURE §5 rule 5, §6.6 dark mode)",
    check: (f, src) => {
      if (!f.endsWith(".css") || /\/tokens\/tokens\.css$/.test(f)) return [];
      const n = literalColours(src);
      return n ? [`${n} literal colour(s)`] : [];
    },
  },
  {
    id: "url-through-router",
    why: "every URL change goes through the router, never history.replaceState/pushState (TARGET_ARCHITECTURE §5 rule 3)",
    check: (f, src) => (/\.tsx?$/.test(f) ? [...src.matchAll(/\b(?:window\.)?history\.(replaceState|pushState)\s*\(/g)].map((m) => m[1]!) : []),
  },
  {
    id: "writes-through-helper",
    why: "every write to Django goes through src/lib/auth/http.ts (session cookie + CSRF): CODE_REVIEW R-23",
    check: (f, src) =>
      /\.tsx?$/.test(f) && !rel(f).startsWith("src/lib/auth/http.ts") && !rel(f).startsWith("src/server/")
        ? fetchCalls(src).flatMap((c) => [...c.matchAll(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/g)].map((m) => `fetch ${m[1]}`))
        : [],
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
