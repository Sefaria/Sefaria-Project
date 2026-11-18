// prerender.ts (PLAN §2.5, §2.8). Header: W2 (Phase 1); endpoint articles: W3 (Phase 2).
//
// Runs after `vite build`. Renders the portal components Django includes with react-dom/server into
// dist/prerender/ and writes dist/prerender/manifest.json, which {% devportal_prerendered kind key %}
// reads: manifest[kind][key] is a file name in dist/prerender/.
//
//   header         one file per active tab: home, docs, reference, contact, none
//   header-subnav  the same with the ≤768px sub-nav row; Django replaces `tokens.subnavLabel` with the
//                  HTML-escaped page title
//
// The components load through Vite's SSR module loader with the build's own config, so CSS Module class
// names are the ones in the built CSS; the script fails if a class in the output is missing from it.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');
const OUT = resolve(DIST, 'prerender');
const VITE_MANIFEST = resolve(DIST, '.vite', 'manifest.json');

interface HeaderVariant {
  kind: string;
  key: string;
  file: string;
  props: unknown;
}

interface HeaderModule {
  headerVariants: () => HeaderVariant[];
  renderHeader: (props: unknown) => string;
  SUBNAV_LABEL_TOKEN: string;
}

interface ViteManifestChunk {
  file: string;
  css?: string[];
  isEntry?: boolean;
}

if (!existsSync(VITE_MANIFEST)) {
  console.error('prerender: dist/.vite/manifest.json not found; run vite build first');
  process.exit(1);
}

/** All CSS the entry loads, to check the prerendered class names against. */
function builtCss(): string {
  const manifest = JSON.parse(readFileSync(VITE_MANIFEST, 'utf8')) as Record<string, ViteManifestChunk>;
  const files = Object.values(manifest).flatMap((chunk) => chunk.css ?? []);
  return [...new Set(files)].map((file) => readFileSync(resolve(DIST, file), 'utf8')).join('\n');
}

function missingClasses(html: string, css: string): string[] {
  const classes = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => (match[1] ?? '').split(/\s+/)));
  return [...classes].filter((name) => name !== '' && !css.includes(`.${name}`));
}

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  mode: 'production',
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const header = (await server.ssrLoadModule('/src/shell/PortalHeader/prerender.tsx')) as HeaderModule;
  const css = builtCss();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const manifest: Record<string, unknown> = {
    version: 1,
    tokens: { subnavLabel: header.SUBNAV_LABEL_TOKEN },
  };
  const problems: string[] = [];
  for (const variant of header.headerVariants()) {
    const html = header.renderHeader(variant.props);
    const missing = missingClasses(html, css);
    if (missing.length > 0) problems.push(`${variant.file}: classes not in the built CSS: ${missing.join(', ')}`);
    writeFileSync(resolve(OUT, variant.file), html + '\n');
    const files = (manifest[variant.kind] ??= {}) as Record<string, string>;
    files[variant.key] = variant.file;
  }
  if (problems.length > 0) {
    console.error(`prerender: ${problems.join('\n')}`);
    process.exitCode = 1;
  } else {
    writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`prerender: wrote ${Object.keys(manifest).length - 2} kinds to dist/prerender/`);
  }
} finally {
  await server.close();
}
