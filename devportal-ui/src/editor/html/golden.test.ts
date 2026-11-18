// editor_golden (PLAN Phase 7): the editor's HTML for each C4 fixture (TipTap's renderHTML plus the server's
// finishing steps, ./export.ts) normalizes to the Python golden. The same comparison runs in pytest
// (devportal/tests/pure/editor_golden_test.py) on what scripts/roundtrip-corpus.ts writes.
import { generateHTML } from '@tiptap/core';
import { join } from 'node:path';
import { parseMarkdown } from '../markdown/parse';
import { schemaExtensions } from '../schema/extensions';
import { CONTRACTS, markdownFiles, read } from '../test/paths';
import { exportHtml, renderHtmlRaw } from './export';
import { normalizeHtml } from './normalize';

const FIXTURES = markdownFiles(join(CONTRACTS, 'fixtures/markdown')).filter(([name]) => !name.includes('/'));

interface Case {
  name: string;
  input: string;
  expected: string;
}

describe('normalizeHtml', () => {
  const cases = (JSON.parse(read(join(CONTRACTS, 'normalize_cases.json'))) as { cases: Case[] }).cases;
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(normalizeHtml(c.input)).toBe(c.expected);
    expect(normalizeHtml(c.expected)).toBe(c.expected);
  });
});

describe('editor HTML equals the C4 goldens', () => {
  it('covers every fixture', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(FIXTURES)('%s', (name, path) => {
    const doc = parseMarkdown(read(path));
    const raw = (doc.content ?? []).filter((n) => n.type === 'rawMarkdown' && n.attrs?.kind !== 'frontmatter');
    expect(raw, 'every construct of the fixture is modelled').toEqual([]);
    const golden = read(join(CONTRACTS, 'golden/markdown', name.replace(/\.md$/, '.html')));
    // The goldens are rendered with revision "1" (devportal/markdown/golden.py).
    expect(normalizeHtml(exportHtml(doc, { revision: '1' }))).toBe(normalizeHtml(golden));
  });

  it('starts from what TipTap generateHTML produces', () => {
    const doc = parseMarkdown(read(FIXTURES[2]![1]));
    expect(renderHtmlRaw(doc)).toBe(generateHTML(doc, schemaExtensions()));
  });
});
