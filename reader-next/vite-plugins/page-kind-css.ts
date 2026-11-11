/**
 * The stylesheets of each page kind's chunk, for the server-rendered head (v-exits F-2).
 *
 * The `$` route renders two kinds of page, each its own dynamically imported chunk (src/features/reader/page-kinds.tsx, T-H03).
 * TanStack Start's route manifest lists the CSS of a route's static imports only, so the reader's own stylesheet (the Workspace
 * chunk: every reader class) reached the browser only when the JS chunk loaded: the first paint was unstyled and its hydration a
 * layout shift of ~0.4 on a phone. This plugin reads, from the client build, the CSS of each page kind's chunk and of the chunks it
 * imports statically, and gives it to the server build as `virtual:page-kind-css` (`{ text: [href…], book: [href…] }`), which the
 * `$` route's head() links.
 *
 * In the client build and in dev the module is empty: dev links every module's CSS itself (Start's dev styles crawl dynamic imports
 * too), and in the browser the chunk's own loader waits for its CSS before the page renders (Vite's preload helper), while React keeps
 * the server's `<link precedence>` once hydrated.
 */
import type { Plugin } from "vite";

export const PAGE_KIND_CSS_MODULE = "virtual:page-kind-css";
const RESOLVED = `\0${PAGE_KIND_CSS_MODULE}`;

/** Which module is each page kind's chunk (the dynamic imports in page-kinds.tsx). */
export const PAGE_KIND_ENTRIES: Record<string, string> = {
  text: "/src/features/workspace/Workspace.tsx",
  book: "/src/features/book/BookRoute.tsx",
};

/** The parts of a Rollup output chunk this reads. */
export interface BundleChunk {
  type: "chunk" | "asset";
  fileName: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: string[];
  viteMetadata?: { importedCss: Set<string> };
}

/** Routes whose stylesheets Start's manifest already links on a page of the `$` route (the root and the route itself). */
const MANIFEST_ROUTE = /\/src\/routes\/(\$|__root)\.tsx/;

/**
 * Each page kind's own stylesheets, in import order (a chunk's static imports first, then its own), from a client bundle: what the
 * kind's chunk and its static imports bring, less what the page links anyway (the client entry's static graph and the root and `$`
 * route chunks', which Start's manifest links). So the head adds only the kind's sheets, after the shell's, in one order on every
 * page. A kind whose chunk is not in the bundle is left out.
 */
export function pageKindCss(bundle: Record<string, BundleChunk>, entries: Record<string, string> = PAGE_KIND_ENTRIES, base = "/"): Record<string, string[]> {
  const chunks = Object.values(bundle).filter((c) => c.type === "chunk");
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const cssOf = (start: BundleChunk[]): string[] => {
    const css: string[] = [];
    const seen = new Set<string>();
    const walk = (c: BundleChunk) => {
      if (seen.has(c.fileName)) return;
      seen.add(c.fileName);
      for (const f of c.imports ?? []) {
        const dep = byFile.get(f);
        if (dep) walk(dep);
      }
      for (const f of c.viteMetadata?.importedCss ?? []) if (!css.includes(f)) css.push(f);
    };
    start.forEach(walk);
    return css;
  };
  const shared = new Set(cssOf(chunks.filter((c) => c.isEntry || MANIFEST_ROUTE.test(c.facadeModuleId?.replace(/\\/g, "/") ?? ""))));
  const out: Record<string, string[]> = {};
  for (const [kind, suffix] of Object.entries(entries)) {
    const entry = chunks.find((c) => c.facadeModuleId?.replace(/\\/g, "/").endsWith(suffix));
    if (!entry) continue;
    out[kind] = cssOf([entry]).filter((f) => !shared.has(f)).map((f) => `${base.replace(/\/?$/, "/")}${f}`);
  }
  return out;
}

/** The file the server build carries the lists in too, for the bundle budget (scripts/budgets/measure.mjs). */
export const PAGE_KIND_CSS_FILE = "page-kind-css.json";

export function pageKindCssPlugin(): Plugin {
  let found: Record<string, string[]> = {};
  let base = "/";
  return {
    name: "sefaria:page-kind-css",
    configResolved(config) {
      base = config.base || "/";
    },
    resolveId(id) {
      return id === PAGE_KIND_CSS_MODULE ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      // only the server build gets the hrefs (they exist once the client build, which runs first, is written)
      const server = this.environment?.name === "ssr" && this.environment.config.command === "build";
      return `export default ${JSON.stringify(server ? found : {})};`;
    },
    generateBundle(_options, bundle) {
      if (this.environment?.name === "ssr" && this.environment.config.command === "build") {
        this.emitFile({ type: "asset", fileName: PAGE_KIND_CSS_FILE, source: JSON.stringify(found) });
        return;
      }
      if (this.environment?.name !== "client") return;
      found = pageKindCss(bundle as unknown as Record<string, BundleChunk>, PAGE_KIND_ENTRIES, base);
      // a renamed or moved page kind must not silently bring the unstyled first paint back
      for (const kind of Object.keys(PAGE_KIND_ENTRIES)) if (!found[kind]?.length) this.error(`page-kind-css: no stylesheet found for the "${kind}" page kind`);
    },
  };
}
