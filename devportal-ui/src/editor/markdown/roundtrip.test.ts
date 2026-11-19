// I-1, the editor's round trip over the 152 source files of devportal/migration_source/ (PLAN §2.11):
// RT-1 identity (opening and saving without edits returns the same bytes) and RT-3 locality (editing one
// paragraph changes only that block's lines). RT-2 (meaning, with every block forced through the serializer) is
// checked by devportal/tests/pure/roundtrip_test.py on what scripts/roundtrip-corpus.ts writes; the parts that need
// no Python renderer (idempotence, no fallbacks) are also checked here.
import { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { editorSchema } from '../html/export';
import { MIGRATION_SOURCE, markdownFiles, read } from '../test/paths';
import { dirtyPlugin } from './dirty';
import { parseMarkdown } from './parse';
import { serializeMarkdown } from './serialize';

const FILES = markdownFiles(MIGRATION_SOURCE).filter(([rel]) => !rel.startsWith('live/'));

function load(source: string): PMNode {
  return PMNode.fromJSON(editorSchema(), parseMarkdown(source));
}

describe('the corpus', () => {
  it('has the 152 source files', () => {
    expect(FILES).toHaveLength(152);
  });
});

describe('RT-1: serialize(parse(source)) === source', () => {
  it.each(FILES)('%s', (_rel, path) => {
    const source = read(path);
    expect(serializeMarkdown(load(source))).toBe(source);
  });
});

describe('RT-2 (TypeScript side): forced re-serialization is stable and models every block', () => {
  it.each(FILES)('%s', (_rel, path) => {
    const doc = load(read(path));
    const once = serializeMarkdown(doc, { forceDirty: true });
    const twice = serializeMarkdown(load(once), { forceDirty: true });
    expect(twice).toBe(once);
  });

  it('falls back to raw source for no block of the corpus', () => {
    const fallbacks: string[] = [];
    for (const [rel, path] of FILES) {
      load(read(path)).forEach((node) => {
        if (node.type.name === 'rawMarkdown' && node.attrs.kind !== 'frontmatter') fallbacks.push(rel);
      });
    }
    expect(fallbacks).toEqual([]);
  });
});

// --- RT-3 ---------------------------------------------------------------------------------------------------------

/** 20 files spread over the corpus that have a top-level paragraph. */
function sample(): [string, string][] {
  const withParagraph = FILES.filter(([, path]) => {
    let found = false;
    load(read(path)).forEach((node) => {
      if (node.type.name === 'paragraph' && node.childCount) found = true;
    });
    return found;
  });
  const step = withParagraph.length / 20;
  return Array.from({ length: 20 }, (_, i) => withParagraph[Math.floor(i * step)]!);
}

function lineRange(source: string, doc: PMNode, index: number): [number, number] {
  // The block's own lines: after the source of every earlier block and its lead.
  let before = 0;
  for (let i = 0; i < index; i++) {
    const node = doc.child(i);
    before += String(node.attrs.mdLead).length + String(node.attrs.mdSrc).length;
  }
  before += String(doc.child(index).attrs.mdLead).length;
  const start = source.slice(0, before).split('\n').length - 1;
  const length = String(doc.child(index).attrs.mdSrc).replace(/\n$/, '').split('\n').length;
  return [start, start + length];
}

describe('RT-3: editing one paragraph changes only its lines', () => {
  it.each(sample())('%s', (_rel, path) => {
    const source = read(path);
    let state = EditorState.create({ doc: load(source), plugins: [dirtyPlugin()] });
    // The middle top-level paragraph of the file.
    const paragraphs: number[] = [];
    state.doc.forEach((node, _offset, index) => {
      if (node.type.name === 'paragraph' && node.childCount) paragraphs.push(index);
    });
    const index = paragraphs[Math.floor(paragraphs.length / 2)]!;
    let pos = 0;
    for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
    const end = pos + state.doc.child(index).nodeSize - 1;
    const [start, stop] = lineRange(source, state.doc, index);

    const tr = state.tr.setSelection(TextSelection.create(state.doc, end)).insertText(' Edited in the editor.');
    state = state.apply(tr);
    expect(state.doc.child(index).attrs.mdSrc).toBeNull();
    state.doc.forEach((node, _o, i) => {
      if (i !== index) expect(node.attrs.mdSrc, `block ${i} stays clean`).not.toBeNull();
    });

    const before = source.split('\n');
    const after = serializeMarkdown(state.doc).split('\n');
    expect(after.slice(0, start)).toEqual(before.slice(0, start));
    const tail = before.length - stop;
    expect(after.slice(after.length - tail)).toEqual(before.slice(stop));
    const changed = after.slice(start, after.length - tail).join('\n');
    expect(changed).toContain('Edited in the editor.');
  });
});

describe('the dirty plugin', () => {
  it('keeps a moved block clean and marks an edited one', () => {
    const source = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n';
    let state = EditorState.create({ doc: load(source), plugins: [dirtyPlugin()] });
    const first = state.doc.child(1);
    const second = state.doc.child(2);
    // Move the second paragraph before the first.
    const p1 = state.doc.child(0).nodeSize;
    const p2 = p1 + first.nodeSize;
    state = state.apply(state.tr.delete(p2, p2 + second.nodeSize).insert(p1, second));
    expect(serializeMarkdown(state.doc)).toBe('# Title\n\nSecond paragraph.\n\nFirst paragraph.\n');
    state = state.apply(state.tr.insertText('!', p1 + second.nodeSize - 1));
    expect(serializeMarkdown(state.doc)).toBe('# Title\n\nSecond paragraph.!\n\nFirst paragraph.\n');
  });

  it('separates a new block from its neighbours', () => {
    const source = 'One.\n\nTwo.\n';
    let state = EditorState.create({ doc: load(source), plugins: [dirtyPlugin()] });
    const schema = state.schema;
    const node = schema.nodes.paragraph!.create(null, schema.text('New.'));
    state = state.apply(state.tr.insert(state.doc.child(0).nodeSize, node));
    expect(serializeMarkdown(state.doc)).toBe('One.\n\nNew.\n\nTwo.\n');
  });
});
