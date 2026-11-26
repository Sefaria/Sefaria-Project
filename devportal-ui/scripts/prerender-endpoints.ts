// prerender-endpoints.ts (PLAN §2.5, §2.8). W3. Called by scripts/prerender.ts (W2 owns that file).
//
// Renders the content area of every endpoint page (article and playground, src/reference/Endpoint.tsx) with
// react-dom/server into dist/prerender/endpoint-<operationId>.html, and records them in dist/prerender/manifest.json
// under "endpoint". The React entry is bundled by Vite in SSR mode with the package's own vite.config.ts, so CSS
// Module class names are the ones of the client bundle.
//
// Django includes the file with {% devportal_prerendered "endpoint" operation_id %}. The title and description come
// from the spec there; the elements carrying them have data-dp-slot="title" / "description" for an overlay to
// replace, and the client re-renders the region from the page payload on mount (createRoot).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

interface IndexFile {
  operations: { operationId: string; file: string }[];
}

const PACKAGE = resolve(import.meta.dirname, '..');

/** Class names in `html` that the built CSS does not define (CSS Module names must match the client bundle). */
function missingClasses(html: string, css: string): string[] {
  const classes = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => (match[1] ?? '').split(/\s+/)));
  return [...classes].filter((name) => name.startsWith('dp-') && !css.includes(`.${name}`));
}

export async function prerenderEndpoints(dist: string, builtCss?: string): Promise<Record<string, string>> {
  const specDir = resolve(dist, 'spec');
  const indexPath = resolve(specDir, 'index.json');
  if (!existsSync(indexPath)) throw new Error(`prerender-endpoints: ${indexPath} not found; run build-spec first`);
  // Under Node, CodeMirror's runMode comes from runmode.node.js, which registers itself as `codemirror` in Node's
  // module cache; it must load before the bundle's external `codemirror` imports (src/reference/code/highlight.ts).
  createRequire(import.meta.url)('codemirror/addon/runmode/runmode.node.js');

  const ssrOut = resolve(PACKAGE, 'node_modules', '.tmp', 'prerender-endpoints');
  rmSync(ssrOut, { recursive: true, force: true });
  await build({
    root: PACKAGE,
    configFile: resolve(PACKAGE, 'vite.config.ts'),
    logLevel: 'warn',
    publicDir: false,
    build: {
      ssr: true,
      outDir: ssrOut,
      emptyOutDir: true,
      manifest: false,
      rollupOptions: { input: { entry: resolve(PACKAGE, 'src/reference/prerender/entry.tsx') } },
    },
  });
  const entry = (await import(pathToFileURL(resolve(ssrOut, 'entry.js')).href)) as {
    renderEndpointHtml: (op: unknown) => string;
  };

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as IndexFile;
  const out = resolve(dist, 'prerender');
  mkdirSync(out, { recursive: true });
  const written: Record<string, string> = {};
  // The reference UI's styles are in the client bundle only once the app renders it (routes.tsx). Until then no
  // endpoint class is in the built CSS, which is reported, not fatal; once it is, every class must be there.
  const bundled = builtCss !== undefined && builtCss.includes('.dp-Endpoint-module__');
  if (builtCss !== undefined && !bundled) {
    console.warn('prerender-endpoints: the client bundle has no reference UI styles yet (src/reference not routed)');
  }
  for (const { operationId, file } of index.operations) {
    const op: unknown = JSON.parse(readFileSync(resolve(specDir, file), 'utf8'));
    const name = `endpoint-${operationId}.html`;
    const html = entry.renderEndpointHtml(op);
    if (builtCss !== undefined && bundled) {
      const missing = missingClasses(html, builtCss);
      if (missing.length > 0)
        throw new Error(`prerender-endpoints: ${name}: classes not in the built CSS: ${missing.join(', ')}`);
    }
    writeFileSync(resolve(out, name), html);
    written[operationId] = name;
  }

  // Merge into the shared manifest (the header entries are written by prerender.ts).
  const manifestPath = resolve(out, 'manifest.json');
  const manifest: Record<string, unknown> = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>)
    : {};
  manifest.endpoint = written;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(ssrOut, { recursive: true, force: true });
  console.log(`prerender-endpoints: wrote ${Object.keys(written).length} endpoint files to dist/prerender/`);
  return written;
}
