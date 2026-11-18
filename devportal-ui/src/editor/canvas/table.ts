// Row and column commands for the C4 table (thead/tbody sections, cells holding blocks).
import type { Editor, JSONContent } from '@tiptap/core';

interface TableAt {
  pos: number;
  json: JSONContent;
  row: number;
  col: number;
}

/** The table around the selection, with the selected row (counted over head and body) and column. */
export function tableAt(editor: Editor): TableAt | null {
  const $from = editor.state.selection.$from;
  let col = -1;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'dpTableHeader' || node.type.name === 'dpTableCell') col = $from.index(depth - 1);
    if (node.type.name === 'dpTable') {
      let row = 0;
      let found = -1;
      const rowDepth = depth + 2;
      const target = $from.depth >= rowDepth ? $from.node(rowDepth) : null;
      node.forEach((section) =>
        section.forEach((r) => {
          if (r === target) found = row;
          row++;
        })
      );
      return { pos: $from.before(depth), json: node.toJSON() as JSONContent, row: found, col };
    }
  }
  return null;
}

function rows(table: JSONContent): JSONContent[] {
  return (table.content ?? []).flatMap((section) => section.content ?? []);
}

function emptyCell(type: string, align: unknown): JSONContent {
  return { type, attrs: { align: align ?? null }, content: [{ type: 'paragraph' }] };
}

function replace(editor: Editor, at: TableAt): boolean {
  const node = editor.schema.nodeFromJSON(at.json);
  const size = editor.state.doc.nodeAt(at.pos)?.nodeSize ?? 0;
  editor.view.dispatch(editor.state.tr.replaceWith(at.pos, at.pos + size, node));
  return true;
}

export function addRow(editor: Editor): boolean {
  const at = tableAt(editor);
  if (!at) return false;
  const body = at.json.content?.find((s) => s.type === 'dpTableBody');
  const width = rows(at.json)[0]?.content?.length ?? 1;
  const template = rows(at.json)[0]?.content ?? [];
  const row: JSONContent = {
    type: 'dpTableRow',
    content: Array.from({ length: width }, (_, i) => emptyCell('dpTableCell', template[i]?.attrs?.align)),
  };
  if (body) {
    const headRows = rows(at.json).length - (body.content?.length ?? 0);
    const index = Math.max(0, at.row - headRows + 1);
    body.content = [...(body.content ?? []).slice(0, index), row, ...(body.content ?? []).slice(index)];
  } else {
    at.json.content = [...(at.json.content ?? []), { type: 'dpTableBody', content: [row] }];
  }
  return replace(editor, at);
}

export function addColumn(editor: Editor): boolean {
  const at = tableAt(editor);
  if (!at) return false;
  const index = at.col < 0 ? Infinity : at.col + 1;
  for (const section of at.json.content ?? []) {
    for (const row of section.content ?? []) {
      const cells = row.content ?? [];
      const type = section.type === 'dpTableHead' ? 'dpTableHeader' : 'dpTableCell';
      const i = Math.min(index, cells.length);
      row.content = [...cells.slice(0, i), emptyCell(type, null), ...cells.slice(i)];
    }
  }
  if (Array.isArray(at.json.attrs?.align) && at.json.attrs.align.length >= index) {
    const align = [...(at.json.attrs.align as unknown[])];
    align.splice(index, 0, null);
    at.json.attrs = { ...at.json.attrs, align };
  }
  return replace(editor, at);
}

export function deleteRow(editor: Editor): boolean {
  const at = tableAt(editor);
  if (!at || at.row < 0 || rows(at.json).length <= 1) return false;
  let row = 0;
  for (const section of at.json.content ?? []) {
    section.content = (section.content ?? []).filter(() => row++ !== at.row);
  }
  at.json.content = (at.json.content ?? []).filter((s) => (s.content ?? []).length > 0);
  return replace(editor, at);
}

export function deleteColumn(editor: Editor): boolean {
  const at = tableAt(editor);
  if (!at || at.col < 0 || (rows(at.json)[0]?.content?.length ?? 0) <= 1) return false;
  for (const section of at.json.content ?? []) {
    for (const row of section.content ?? []) row.content = (row.content ?? []).filter((_, i) => i !== at.col);
  }
  return replace(editor, at);
}
