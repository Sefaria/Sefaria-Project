// Writes the TypeScript side of the editor's cross-language checks (PLAN §2.11, I-1) for the pure pytest
// devportal/tests/pure/roundtrip_test.py (RT-2) and devportal/tests/pure/editor_golden_test.py:
//
//   <out>/roundtrip/<path>.md          each of the 152 source files with every block forced through the serializer
//   <out>/roundtrip/<path>.twice.md    the same output parsed and forced through again (must be identical)
//   <out>/golden/<fixture>.html        the editor's HTML for each C4 fixture (devportal/contracts/fixtures/markdown)
//   <out>/corpus-html/<path>.html      the editor's HTML for each source file (the canvas equals the public page)
//   <out>/dialect.json                 the editor's copies of the dialect tables (emoji, code labels, callouts)
//   <out>/manifest.json                what was written
//
// <out> is `.devportal-run/editor-roundtrip/` at the repository root, or the first argument.
// Run: `npm run roundtrip-corpus` (CI runs it before the pure pytest).
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const REPO = resolve(ROOT, '..');
const OUT = resolve(process.argv[2] ?? join(REPO, '.devportal-run/editor-roundtrip'));
const SOURCE = join(REPO, 'devportal/migration_source');
const FIXTURES = join(REPO, 'devportal/contracts/fixtures/markdown');

function markdownFiles(dir: string, recurse = true): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) {
        if (recurse) walk(path);
      } else if (name.endsWith('.md')) out.push(path);
    }
  };
  walk(dir);
  return out;
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

interface PMNodeLike {
  forEach(fn: (node: { type: { name: string }; attrs: Record<string, unknown> }) => void): void;
}
interface EditorModules {
  parse: { parseMarkdown(source: string): unknown };
  serialize: { serializeMarkdown(doc: unknown, options?: { forceDirty?: boolean }): string };
  exportHtml: {
    editorSchema(): unknown;
    exportHtml(doc: unknown, options: { revision?: string; document?: Document }): string;
  };
  model: { Node: { fromJSON(schema: unknown, json: unknown): PMNodeLike } };
  dialect: Record<string, unknown>;
}

const window = new JSDOM('<!doctype html><html><body></body></html>').window;
// The caption renderer and the sanitizer build DOM nodes; give them a document, as a browser would.
Object.assign(globalThis, { document: window.document });

const server = await createServer({
  root: ROOT,
  configFile: resolve(ROOT, 'vite.config.ts'),
  mode: 'production',
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});

try {
  const m: EditorModules = {
    parse: (await server.ssrLoadModule('/src/editor/markdown/parse.ts')) as EditorModules['parse'],
    serialize: (await server.ssrLoadModule('/src/editor/markdown/serialize.ts')) as EditorModules['serialize'],
    exportHtml: (await server.ssrLoadModule('/src/editor/html/export.ts')) as EditorModules['exportHtml'],
    model: (await server.ssrLoadModule('@tiptap/pm/model')) as EditorModules['model'],
    dialect: (await server.ssrLoadModule('/src/editor/markdown/dialect.ts')) as EditorModules['dialect'],
  };
  const schema = m.exportHtml.editorSchema();
  const load = (source: string) => m.model.Node.fromJSON(schema, m.parse.parseMarkdown(source));

  rmSync(OUT, { recursive: true, force: true });
  const manifest: Record<string, unknown> = { roundtrip: [], golden: [], fallbacks: [] };
  for (const path of markdownFiles(SOURCE)) {
    const rel = relative(SOURCE, path);
    const source = readFileSync(path, 'utf8');
    const doc = load(source);
    doc.forEach((node) => {
      if (node.type.name === 'rawMarkdown' && node.attrs.kind !== 'frontmatter') {
        (manifest.fallbacks as string[]).push(rel);
      }
    });
    const once = m.serialize.serializeMarkdown(doc, { forceDirty: true });
    const twice = m.serialize.serializeMarkdown(load(once), { forceDirty: true });
    write(join(OUT, 'roundtrip', rel), once);
    write(join(OUT, 'roundtrip', rel.replace(/\.md$/, '.twice.md')), twice);
    write(
      join(OUT, 'corpus-html', rel.replace(/\.md$/, '.html')),
      m.exportHtml.exportHtml(doc, { revision: '1', document: window.document })
    );
    (manifest.roundtrip as string[]).push(rel);
  }
  for (const path of markdownFiles(FIXTURES, false)) {
    const name = relative(FIXTURES, path).replace(/\.md$/, '');
    const doc = load(readFileSync(path, 'utf8'));
    write(
      join(OUT, 'golden', name + '.html'),
      m.exportHtml.exportHtml(doc, { revision: '1', document: window.document })
    );
    (manifest.golden as string[]).push(name);
  }
  const d = m.dialect;
  write(
    join(OUT, 'dialect.json'),
    JSON.stringify(
      {
        SHORTCODES: d.SHORTCODES,
        LANG_LABELS: d.LANG_LABELS,
        CALLOUT_EMOJI: d.CALLOUT_EMOJI,
        THEME_ALIASES: d.THEME_ALIASES,
        THEME_ICONS: d.THEME_ICONS,
      },
      null,
      1
    )
  );
  write(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(
    `roundtrip-corpus: ${(manifest.roundtrip as string[]).length} files, ${(manifest.golden as string[]).length} fixtures → ${relative(REPO, OUT)}`
  );
} finally {
  await server.close();
}
