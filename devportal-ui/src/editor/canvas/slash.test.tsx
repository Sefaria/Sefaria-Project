// The "/" menu: what it finds, that each item inserts its construct, and that what it inserts is written back as
// the C4 dialect (and parsed again into the same construct).
import '../test/dom';
import { Editor } from '@tiptap/core';
import { act, render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { DirtyTracking } from '../markdown/dirty';
import { parseMarkdown } from '../markdown/parse';
import { serializeMarkdown } from '../markdown/serialize';
import { schemaExtensions } from '../schema/extensions';
import { Canvas } from './Canvas';
import { SLASH_ITEMS, filterSlashItems, slashQuery } from './slash';

function headless(markdown = 'Intro.\n\n/') {
  const editor = new Editor({ extensions: [...schemaExtensions(), DirtyTracking], content: parseMarkdown(markdown) });
  editor.commands.focus('end');
  return editor;
}

const EXPECTED: Record<string, { node: string; markdown: RegExp }> = {
  paragraph: { node: 'paragraph', markdown: /^Intro\.\n\n/ },
  heading1: { node: 'heading', markdown: /\n# Hello\n/ },
  heading2: { node: 'heading', markdown: /\n## Hello\n/ },
  heading3: { node: 'heading', markdown: /\n### Hello\n/ },
  bulletList: { node: 'bulletList', markdown: /\n\* Hello\n/ },
  orderedList: { node: 'orderedList', markdown: /\n1\. Hello\n/ },
  blockquote: { node: 'blockquote', markdown: /\n> Hello\n/ },
  callout: { node: 'callout', markdown: /<Callout icon="📘" theme="info">\nHello\n<\/Callout>/ },
  codeBlock: { node: 'codeBlock', markdown: /```json\nHello\n```/ },
  table: { node: 'dpTable', markdown: /\| Column 1 \| Column 2 \|\n\| --- \| --- \|\n\| {3}\| {3}\|/ },
  image: { node: 'dpImage', markdown: /<Image src="" align="center" \/>/ },
  embed: { node: 'embed', markdown: /<Embed url="" \/>/ },
  htmlBlock: { node: 'dpHtmlBlock', markdown: /<HTMLBlock>\{`<div>\n {2}\n<\/div>`\}<\/HTMLBlock>/ },
  horizontalRule: { node: 'horizontalRule', markdown: /\n---\n/ },
};

describe('slashQuery', () => {
  it('finds "/" at the start of a block or after a space, up to the cursor', () => {
    const editor = headless('Intro.\n\nsee /cal');
    expect(slashQuery(editor.state)).toMatchObject({ query: 'cal' });
    editor.commands.insertContent('x y');
    expect(slashQuery(editor.state)).toBeNull();
    editor.destroy();
  });

  it('ignores a slash inside a word and inside code', () => {
    const a = headless('and/or');
    expect(slashQuery(a.state)).toBeNull();
    a.destroy();
    const b = headless('```\n/\n```');
    expect(slashQuery(b.state)).toBeNull();
    b.destroy();
  });
});

describe('filterSlashItems', () => {
  it('matches labels and keywords', () => {
    expect(filterSlashItems('cal').map((i) => i.id)).toEqual(['callout']);
    expect(filterSlashItems('video').map((i) => i.id)).toEqual(['embed']);
    expect(filterSlashItems('h2').map((i) => i.id)).toEqual(['heading2']);
    expect(filterSlashItems('')).toHaveLength(SLASH_ITEMS.length);
    expect(filterSlashItems('nothing-like-this')).toEqual([]);
  });
});

describe('every slash item', () => {
  it('covers every construct of the dialect and the standard blocks', () => {
    expect(SLASH_ITEMS.map((i) => i.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(SLASH_ITEMS.map((item) => [item.id, item] as const))('%s inserts its block and round-trips', (id, item) => {
    const editor = headless();
    const range = slashQuery(editor.state)?.range;
    expect(range).toBeDefined();
    item.run(editor, range!);
    const expected = EXPECTED[id]!;
    const types: string[] = [];
    editor.state.doc.forEach((n) => types.push(n.type.name));
    expect(types).toContain(expected.node);
    if (!['image', 'embed', 'htmlBlock', 'horizontalRule', 'table'].includes(id))
      editor.commands.insertContent('Hello');
    const markdown = serializeMarkdown(editor.state.doc);
    expect(markdown).toMatch(expected.markdown);
    expect(markdown.startsWith('Intro.\n')).toBe(true);
    // Parsed again, the construct comes back.
    const again = parseMarkdown(markdown);
    expect((again.content ?? []).map((n) => n.type)).toContain(expected.node);
    editor.destroy();
  });
});

describe('the menu in the canvas', () => {
  async function openMenu() {
    let editor: Editor | null = null;
    const view = render(<Canvas content={parseMarkdown('Intro.\n')} label="Body" onReady={(e) => (editor = e)} />);
    await act(async () => {
      editor!.commands.focus('end');
      editor!.commands.insertContent([{ type: 'paragraph', content: [{ type: 'text', text: '/cal' }] }]);
    });
    return { view, editor: editor! };
  }

  it('lists matching blocks and inserts the chosen one with the keyboard', async () => {
    const { editor } = await openMenu();
    const listbox = await screen.findByRole('listbox', { name: 'Insert a block' });
    expect(listbox).toBeInTheDocument();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Callout')]);
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent('Callout');
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const types: string[] = [];
    editor.state.doc.forEach((n) => types.push(n.type.name));
    expect(types).toContain('callout');
  });

  it('closes with Escape and has no axe violations while open', async () => {
    const { view, editor } = await openMenu();
    await screen.findByRole('listbox');
    expect(await axe(view.container)).toHaveNoViolations();
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
