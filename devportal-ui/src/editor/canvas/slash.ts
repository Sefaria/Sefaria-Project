// The "/" menu (PLAN §2.11): every C4 construct and the standard blocks. `slashQuery` finds an open "/" command
// before the cursor; `SLASH_ITEMS` insert their block in its place.
import type { Editor, JSONContent, Range } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';

export interface SlashItem {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  run(editor: Editor, range: Range): void;
}

export interface SlashQuery {
  query: string;
  range: Range;
}

/** "/" at the start of a text block or after a space, followed by letters, digits or `-`, up to the cursor. */
export function slashQuery(state: EditorState): SlashQuery | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const m = /(?:^|\s)\/([\w-]{0,30})$/.exec(before);
  if (!m) return null;
  const query = m[1] ?? '';
  return { query, range: { from: selection.from - query.length - 1, to: selection.from } };
}

function insert(content: JSONContent | JSONContent[]) {
  return (editor: Editor, range: Range) => {
    editor.chain().focus().deleteRange(range).insertContent(content).run();
  };
}

function paragraph(text = ''): JSONContent {
  return text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
}

function cell(type: 'dpTableHeader' | 'dpTableCell', text: string): JSONContent {
  return { type, attrs: { align: null }, content: [paragraph(text)] };
}

const TABLE: JSONContent = {
  type: 'dpTable',
  attrs: { form: 'pipe', align: [] },
  content: [
    {
      type: 'dpTableHead',
      content: [
        { type: 'dpTableRow', content: [cell('dpTableHeader', 'Column 1'), cell('dpTableHeader', 'Column 2')] },
      ],
    },
    {
      type: 'dpTableBody',
      content: [{ type: 'dpTableRow', content: [cell('dpTableCell', ''), cell('dpTableCell', '')] }],
    },
  ],
};

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    id: 'paragraph',
    label: 'Text',
    description: 'A plain paragraph',
    keywords: ['paragraph', 'text', 'p'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
  },
  ...[1, 2, 3].map((level): SlashItem => ({
    id: `heading${level}`,
    label: `Heading ${level}`,
    description: level === 1 ? 'Large section heading' : level === 2 ? 'Section heading' : 'Subsection heading',
    keywords: ['heading', 'title', `h${level}`],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setNode('heading', { level }).run(),
  })),
  {
    id: 'bulletList',
    label: 'Bulleted list',
    description: 'A list with bullets',
    keywords: ['list', 'bullet', 'ul', 'unordered'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleList('bulletList', 'listItem').run(),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    description: 'A list with numbers',
    keywords: ['list', 'number', 'ol', 'ordered'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleList('orderedList', 'listItem').run(),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    description: 'A block quotation',
    keywords: ['quote', 'blockquote'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).wrapIn('blockquote').run(),
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'A highlighted note with an icon and a theme',
    keywords: ['callout', 'note', 'warning', 'info', 'alert', 'admonition'],
    run: insert({ type: 'callout', attrs: { form: 'component', theme: 'info', icon: '📘' }, content: [paragraph()] }),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    description: 'Code with a language and a tab title',
    keywords: ['code', 'snippet', 'pre', 'fence'],
    run: insert({ type: 'codeBlock', attrs: { language: 'json', title: '' } }),
  },
  {
    id: 'table',
    label: 'Table',
    description: 'A table with a header row',
    keywords: ['table', 'grid', 'columns'],
    run: insert(TABLE),
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Upload an image or link to one',
    keywords: ['image', 'picture', 'screenshot', 'img', 'photo'],
    run: insert({ type: 'dpImage', attrs: { form: 'component', src: '', align: 'center' } }),
  },
  {
    id: 'embed',
    label: 'Embed',
    description: 'A YouTube video',
    keywords: ['embed', 'video', 'youtube'],
    run: insert({ type: 'embed', attrs: { url: '', title: '' } }),
  },
  {
    id: 'htmlBlock',
    label: 'HTML block',
    description: 'Custom HTML, shown in a sandboxed frame',
    keywords: ['html', 'htmlblock', 'custom'],
    run: insert({ type: 'dpHtmlBlock', attrs: { html: '<div>\n  \n</div>' } }),
  },
  {
    id: 'horizontalRule',
    label: 'Divider',
    description: 'A horizontal line',
    keywords: ['divider', 'hr', 'rule', 'line', 'separator'],
    run: insert([{ type: 'horizontalRule' }, paragraph()]),
  },
];

export function filterSlashItems(query: string, items: readonly SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) => item.label.toLowerCase().includes(q) || item.keywords.some((k) => k.startsWith(q)));
}
