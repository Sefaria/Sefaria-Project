// Editor document → Markdown (C4 dialect), source-preserving (PLAN §2.11).
//
// A top-level node whose `mdSrc` is set (it has not been edited since it was parsed) is written back as its `mdLead`
// and `mdSrc`, byte for byte. A node whose `mdSrc` is null (edited, moved or new) is serialized from its content by
// prosemirror-markdown with the handlers below, after its `mdLead`. So saving without edits returns the original
// bytes (RT-1), and an edit changes only the edited block's lines (RT-3). `forceDirty` serializes every block from
// its content, which is how RT-2 checks that the handlers keep the meaning.
import type { Mark, Node as PMNode, Schema } from '@tiptap/pm/model';
import { MarkdownSerializer, MarkdownSerializerState, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { escapeTemplate, type JsxAttr, type JsxValue } from './md';
import { at, must } from '../util';

type State = MarkdownSerializerState;
type MarkSerializerSpec = ConstructorParameters<typeof MarkdownSerializer>[1][string];
type NodeHandler = (state: State, node: PMNode, parent: PMNode, index: number) => void;

/** Whether a line right after `node` (no blank line between) would continue it (lazy continuation). */
function continuable(node: PMNode): boolean {
  switch (node.type.name) {
    case 'paragraph':
    case 'bulletList':
    case 'orderedList':
    case 'blockquote':
    case 'imageGroup':
      return true;
    case 'dpImage':
      return node.attrs.form === 'markdown';
    case 'callout':
      return node.attrs.form === 'blockquote';
    case 'dpTable':
      return node.attrs.form === 'pipe';
    default:
      return false;
  }
}

/** Blocks that would be absorbed by a continuable block right before them. */
const PARAGRAPH_LIKE = new Set(['paragraph', 'imageGroup', 'dpImage']);

export interface SerializeOptions {
  /** Ignore every `mdSrc` and serialize all blocks from their content (RT-2). */
  forceDirty?: boolean;
}

export function serializeMarkdown(doc: PMNode, options: SerializeOptions = {}): string {
  let out = '';
  let prev: { node: PMNode; dirty: boolean } | null = null;
  doc.forEach((node) => {
    const keep = !options.forceDirty || node.attrs.kind === 'frontmatter';
    const src = keep ? (node.attrs.mdSrc as string | null) : null;
    let lead = String(node.attrs.mdLead ?? '');
    // A blank line already separates this block from the one before it (in the lead, or at the end of its source).
    const separated = /\n[ \t]*\n[ \t]*$/.test(out + lead);
    // Edits can put two blocks next to each other that were not neighbours in the source; keep them apart.
    if (
      prev &&
      !separated &&
      (src === null || (continuable(prev.node) && (prev.dirty || PARAGRAPH_LIKE.has(node.type.name))))
    ) {
      lead = '\n' + lead;
    }
    out += src !== null ? lead + src : lead + serializeBlock(node) + '\n';
    prev = { node, dirty: src === null };
  });
  return out + String(doc.attrs.trail ?? '');
}

/** One block (and its children) as Markdown, without a trailing newline. */
export function serializeBlock(node: PMNode): string {
  const doc = node.type.schema.topNodeType.create({ trail: '' }, [node]);
  return serializer.serialize(doc).replace(/\n+$/, '');
}

/** A list of blocks (a cell's or a callout's inside) as Markdown. */
export function serializeBlocks(schema: Schema, nodes: readonly PMNode[]): string {
  if (!nodes.length) return '';
  const doc = schema.topNodeType.create({ trail: '' }, nodes as PMNode[]);
  return serializer.serialize(doc).replace(/\n+$/, '');
}

// --- JSX attributes -----------------------------------------------------------------------------------------------

function formatValue(value: JsxValue, quote: JsxAttr['quote'], raw?: string): string {
  if (quote === '{') return `{${raw ?? JSON.stringify(value)}}`;
  if (quote === '' && value === true) return '';
  if (typeof value === 'string') {
    if (!value.includes('"')) return `="${value}"`;
    if (!value.includes("'")) return `='${value}'`;
    return `={${JSON.stringify(value)}}`;
  }
  return `={${JSON.stringify(value)}}`;
}

/** `name="v" other={…}`: known attributes from `values` (in `order`), unknown ones kept from `original`. */
export function jsxAttributes(
  original: readonly JsxAttr[] | null,
  values: Record<string, JsxValue | undefined>,
  order: readonly string[]
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const known = new Set(order);
  const emit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const value = values[name];
    if (value === undefined || value === null) return;
    const before = original?.filter((a) => a.name === name).at(-1);
    if (typeof value === 'boolean') {
      parts.push(`${name}={${value}}`);
    } else if (before && before.quote !== '{' && before.value === value) {
      parts.push(name + (before.quote ? `=${before.quote}${value}${before.quote}` : ''));
    } else if (before && before.quote === '{' && JSON.stringify(before.value) === JSON.stringify(value)) {
      parts.push(`${name}={${before.raw}}`);
    } else {
      parts.push(name + formatValue(value, typeof value === 'string' ? '"' : '{'));
    }
  };
  for (const attr of original ?? []) {
    if (known.has(attr.name)) emit(attr.name);
    else if (!seen.has(attr.name)) {
      seen.add(attr.name);
      parts.push(attr.name + formatValue(attr.value, attr.quote, attr.raw));
    }
  }
  for (const name of order) emit(name);
  return parts.join(' ');
}

// --- helpers ------------------------------------------------------------------------------------------------------

function destination(url: string): string {
  if (!url) return '<>';
  if (/[\s<>]/.test(url) || !balancedParens(url)) return '<' + url.replace(/[<>]/g, (c) => encodeURIComponent(c)) + '>';
  return url;
}

function balancedParens(url: string): boolean {
  let depth = 0;
  for (const c of url) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

function quote(text: string): string {
  const wrap = !text.includes('"') ? '""' : !text.includes("'") ? "''" : '()';
  return wrap[0] + text + wrap[1];
}

function titlePart(_state: State, title: string): string {
  return title ? ' ' + quote(title) : '';
}

function escapeAlt(alt: string): string {
  return alt.replace(/[\\[\]]/g, '\\$&');
}

function imageMarkdown(state: State, attrs: Record<string, unknown>): string {
  const altSrc = typeof attrs.altSrc === 'string' ? attrs.altSrc : escapeAlt(String(attrs.alt ?? ''));
  return `![${altSrc}](${destination(String(attrs.src ?? ''))}${titlePart(state, String(attrs.title ?? ''))})`;
}

function fenceFor(content: string): string {
  let longest = 2;
  for (const m of content.matchAll(/`{3,}/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(longest + 1);
}

function writeLines(state: State, text: string): void {
  state.text(text, false);
}

/** Inline content of a paragraph on one line, for a pipe-table cell. */
function inlineOneLine(node: PMNode): string {
  const doc = node.type.schema.topNodeType.create({ trail: '' }, [
    must(node.type.schema.nodes.paragraph).create(null, oneLineContent(node)),
  ]);
  return serializer.serialize(doc).replace(/\n+$/, '');
}

function oneLineContent(node: PMNode): PMNode[] {
  const out: PMNode[] = [];
  node.forEach((child) => {
    if (child.type.name === 'hardBreak') {
      out.push(must(child.type.schema.nodes.htmlInline).create({ html: '<br>' }, null, child.marks));
    } else out.push(child);
  });
  return out;
}

function cellIsInline(cell: PMNode): boolean {
  return cell.childCount === 1 && cell.firstChild?.type.name === 'paragraph';
}

function tableRows(table: PMNode): { section: string; row: PMNode }[] {
  const rows: { section: string; row: PMNode }[] = [];
  table.forEach((section) => section.forEach((row) => rows.push({ section: section.type.name, row })));
  return rows;
}

function pipeTable(table: PMNode): string | null {
  const rows = tableRows(table);
  const head = rows.filter((r) => r.section === 'dpTableHead');
  if (head.length !== 1) return null;
  const headRow = at(head, 0).row;
  const width = headRow.childCount;
  for (const { row } of rows) {
    if (row.childCount !== width) return null;
    let ok = true;
    row.forEach((cell) => {
      if (!cellIsInline(cell)) ok = false;
    });
    if (!ok) return null;
  }
  const line = (row: PMNode) => {
    const cells: string[] = [];
    row.forEach((cell) => cells.push(inlineOneLine(must(cell.firstChild)).replace(/\|/g, '\\|') || ' '));
    return '| ' + cells.join(' | ') + ' |';
  };
  const delimiter: string[] = [];
  headRow.forEach((cell) => {
    const a = cell.attrs.align as string | null;
    delimiter.push(a === 'left' ? ':--' : a === 'center' ? ':-:' : a === 'right' ? '--:' : '---');
  });
  return [line(headRow), '| ' + delimiter.join(' | ') + ' |', ...rows.slice(1).map((r) => line(r.row))].join('\n');
}

function indent(text: string, by: string): string {
  return text
    .split('\n')
    .map((l) => (l.trim() ? by + l : ''))
    .join('\n');
}

function componentTable(table: PMNode): string {
  const align = table.attrs.align as JsxValue[];
  const attrs = jsxAttributes(table.attrs.jsxAttrs as JsxAttr[] | null, { align: align.length ? align : undefined }, [
    'align',
  ]);
  const out: string[] = [`<Table${attrs ? ' ' + attrs : ''}>`];
  table.forEach((section) => {
    const tag = section.type.name === 'dpTableHead' ? 'thead' : 'tbody';
    out.push(`  <${tag}>`);
    section.forEach((row) => {
      out.push('    <tr>');
      row.forEach((cell) => {
        const cellTag = cell.type.name === 'dpTableHeader' ? 'th' : 'td';
        const children: PMNode[] = [];
        cell.forEach((c) => children.push(c));
        out.push(
          `      <${cellTag}>`,
          indent(serializeBlocks(cell.type.schema, children), '        '),
          `      </${cellTag}>`,
          ''
        );
      });
      if (out[out.length - 1] === '') out.pop();
      out.push('    </tr>');
    });
    out.push(`  </${tag}>`, '');
  });
  if (out[out.length - 1] === '') out.pop();
  out.push('</Table>');
  return out.join('\n');
}

// --- inline content -----------------------------------------------------------------------------------------------
//
// prosemirror-markdown nests marks by schema rank; Markdown from the source nests them as written
// (`[**a**](u)` vs `**[a](u)**`, `*a *[*b*](u)` …). So inline content is written here, with each mark's source
// `depth` deciding the nesting and its `span` keeping source spans apart. Marks made in the editor (no depth)
// nest inside source ones, by rank, and whitespace at the edge of a mark is moved outside it.

type BlockStartState = State & { atBlockStart: boolean };

function rank(mark: Mark): number {
  return Object.keys(mark.type.schema.marks).indexOf(mark.type.name);
}

function markOrder(a: Mark, b: Mark): number {
  if (a.type.name === 'code' || b.type.name === 'code') return a.type.name === 'code' ? 1 : -1;
  const da = typeof a.attrs.depth === 'number' ? a.attrs.depth : Number.MAX_SAFE_INTEGER;
  const db = typeof b.attrs.depth === 'number' ? b.attrs.depth : Number.MAX_SAFE_INTEGER;
  return da !== db ? da - db : rank(a) - rank(b);
}

export function orderedMarks(marks: readonly Mark[]): Mark[] {
  return [...marks].sort(markOrder);
}

function codeDelimiter(text: string, preferred: string): string {
  const runs = new Set((text.match(/`+/g) ?? []).map((r) => r.length));
  if (/^`+$/.test(preferred) && !runs.has(preferred.length)) return preferred;
  let n = 1;
  while (runs.has(n)) n++;
  return '`'.repeat(n);
}

function markOpen(mark: Mark, text: string, state: State): string {
  switch (mark.type.name) {
    case 'bold':
      return delimiter('**')(state, mark);
    case 'italic':
      return delimiter('*')(state, mark);
    case 'strike':
      return '~~';
    case 'link':
      return mark.attrs.kind === 'autolink' ? '<' : mark.attrs.kind === 'linkify' ? '' : '[';
    case 'code': {
      const fence = codeDelimiter(text, String(mark.attrs.markup ?? '`'));
      const pad = /^`|`$/.test(text) || /^ .*[^ ].* $/.test(text) ? ' ' : '';
      return fence + pad;
    }
    default:
      return '';
  }
}

function markClose(mark: Mark, text: string, state: State): string {
  switch (mark.type.name) {
    case 'link':
      return linkClose(state, mark);
    case 'code': {
      const pad = /^`|`$/.test(text) || /^ .*[^ ].* $/.test(text) ? ' ' : '';
      return pad + codeDelimiter(text, String(mark.attrs.markup ?? '`'));
    }
    default:
      return markOpen(mark, text, state);
  }
}

function writeInlineText(state: State, node: PMNode, text: string, parent: PMNode, index: number): void {
  const s = state as BlockStartState;
  if (node.marks.some((m) => m.type.name === 'code' || (m.type.name === 'link' && m.attrs.kind !== 'inline'))) {
    state.text(text, false);
    return;
  }
  const prev = index > 0 ? parent.child(index - 1) : null;
  if (prev && prev.type.name === 'hardBreak' && prev.attrs.kind !== 'html') s.atBlockStart = true;
  let escaped = state.esc(text, false);
  if (s.atBlockStart) escaped = escapeLineStart(escaped);
  state.text(escaped, false);
}

/** Marks made in the editor keep whitespace outside (`**a** `); source spans are written as they were. */
function expels(mark: Mark): boolean {
  return mark.attrs.span === null && mark.type.name !== 'code';
}

/** Escape what would start a block at the start of a line, keeping every character (prosemirror-markdown's own
 * start-of-line escape turns the character after `1.` into a space). */
function escapeLineStart(text: string): string {
  return text
    .replace(/^(\+[ \t]|[-*>])/, '\\$&')
    .replace(/^([ \t]*)(#{1,6})([ \t]|$)/, '$1\\$2$3')
    .replace(/^([ \t]*\d+)([.)])([ \t]|$)/, '$1\\$2$3')
    .replace(/^([ \t]*)(=+[ \t]*)$/, '$1\\$2');
}

export function renderInlineContent(state: State, parent: PMNode, fromBlockStart = true): void {
  const s = state as BlockStartState;
  s.atBlockStart = fromBlockStart;
  const active: { mark: Mark; text: string }[] = [];
  let pending = '';
  const closeTo = (n: number) => {
    while (active.length > n) {
      const { mark, text } = must(active.pop());
      state.text(markClose(mark, text, state), false);
    }
  };
  const marksOf = (index: number): Mark[] => {
    const node = parent.child(index);
    let marks = orderedMarks(node.marks);
    if (node.type.name === 'hardBreak') {
      // A break at the end of a mark is written outside it.
      const next = index + 1 < parent.childCount ? parent.child(index + 1) : null;
      marks = marks.filter((m) => next !== null && m.isInSet(next.marks));
    }
    return marks;
  };
  for (let index = 0; index < parent.childCount; index++) {
    const node = parent.child(index);
    const marks = marksOf(index);
    let keep = 0;
    while (keep < active.length && keep < marks.length && at(marks, keep).eq(at(active, keep).mark)) keep++;
    let text = node.isText ? (node.text ?? '') : null;
    let leading = '';
    if (text !== null && marks.slice(keep).some(expels)) {
      leading = /^\s*/.exec(text)?.[0] ?? '';
      text = text.slice(leading.length);
    }
    closeTo(keep);
    if (pending) state.text(pending, false);
    pending = '';
    if (leading) state.text(leading, false);
    if (text === '') continue;
    for (let i = keep; i < marks.length; i++) {
      const mark = at(marks, i);
      state.text(markOpen(mark, text ?? '', state), false);
      active.push({ mark, text: text ?? '' });
      s.atBlockStart = false;
    }
    if (text !== null) {
      const next = index + 1 < parent.childCount ? marksOf(index + 1) : [];
      let k = 0;
      while (k < active.length && k < next.length && at(next, k).eq(at(active, k).mark)) k++;
      if (active.slice(k).some((a) => expels(a.mark))) {
        pending = /\s*$/.exec(text)?.[0] ?? '';
        text = text.slice(0, text.length - pending.length);
      }
      writeInlineText(state, node, text, parent, index);
    } else {
      state.render(node, parent, index);
    }
    s.atBlockStart = false;
  }
  closeTo(0);
  if (pending) state.text(pending, false);
}

// --- node handlers ------------------------------------------------------------------------------------------------

const nodes: Record<string, NodeHandler> = {
  paragraph(state, node) {
    renderInlineContent(state, node);
    state.closeBlock(node);
  },
  heading(state, node) {
    state.write('#'.repeat(node.attrs.level as number) + (node.childCount ? ' ' : ''));
    renderInlineContent(state, node, false);
    state.closeBlock(node);
  },
  blockquote(state, node) {
    state.wrapBlock('> ', null, node, () => state.renderContent(node));
  },
  callout(state, node) {
    if (node.attrs.form === 'blockquote' && typeof node.attrs.icon === 'string') {
      const icon = node.attrs.icon;
      state.wrapBlock('> ', null, node, () => {
        let rest = 0;
        const first = node.firstChild;
        if (first && first.type.name === 'heading' && first.attrs.calloutTitle) {
          state.write(icon + ' ');
          renderInlineContent(state, first, false);
          rest = 1;
        } else {
          state.write(icon);
        }
        state.closeBlock(node);
        for (let i = rest; i < node.childCount; i++) state.render(node.child(i), node, i);
      });
      return;
    }
    const values: Record<string, JsxValue | undefined> = {
      icon: typeof node.attrs.icon === 'string' ? node.attrs.icon : undefined,
      theme: typeof node.attrs.theme === 'string' && node.attrs.theme !== 'default' ? node.attrs.theme : undefined,
    };
    const original = node.attrs.jsxAttrs as JsxAttr[] | null;
    if (original?.some((a) => a.name === 'theme') && values.theme === undefined)
      values.theme = String(node.attrs.theme);
    const attrs = jsxAttributes(original, values, ['icon', 'theme']);
    state.write(`<Callout${attrs ? ' ' + attrs : ''}>\n`);
    state.renderContent(node);
    (state as unknown as { flushClose(size: number): void }).flushClose(1);
    state.ensureNewLine();
    state.write('</Callout>');
    state.closeBlock(node);
  },
  bulletList(state, node) {
    const bullet = String(node.attrs.bullet || '*');
    state.renderList(node, '  ', () => bullet + ' ');
  },
  orderedList(state, node) {
    const start = Number(node.attrs.start ?? 1);
    const delimiter = String(node.attrs.delimiter || '.');
    const width = String(start + node.childCount - 1).length;
    const space = ' '.repeat(width + delimiter.length + 1);
    state.renderList(node, space, (i) => {
      const n = String(start + i);
      return ' '.repeat(width - n.length) + n + delimiter + ' ';
    });
  },
  listItem(state, node) {
    state.renderContent(node);
  },
  codeBlock(state, node) {
    const content = node.textContent;
    const fence = fenceFor(content);
    const info = [node.attrs.language, node.attrs.title].filter(Boolean).join(' ');
    state.write(fence + info + '\n');
    writeLines(state, content + '\n');
    state.write(fence);
    state.closeBlock(node);
  },
  horizontalRule(state, node) {
    state.write(String(node.attrs.markup || '---'));
    state.closeBlock(node);
  },
  dpImage(state, node) {
    if (
      node.attrs.form === 'markdown' &&
      !node.attrs.caption &&
      !node.attrs.align &&
      !node.attrs.width &&
      !node.attrs.framed &&
      node.attrs.border === null
    ) {
      state.write(imageMarkdown(state, node.attrs));
    } else {
      const a = node.attrs;
      const attrs = jsxAttributes(
        a.jsxAttrs as JsxAttr[] | null,
        {
          src: String(a.src ?? ''),
          alt: a.alt ? String(a.alt) : undefined,
          title: a.title ? String(a.title) : undefined,
          align: a.align ? String(a.align) : undefined,
          width: a.width ? String(a.width) : undefined,
          caption: a.caption ? String(a.caption) : undefined,
          border: typeof a.border === 'boolean' ? a.border : undefined,
          framed: a.framed ? true : undefined,
        },
        ['src', 'alt', 'title', 'align', 'width', 'caption', 'border', 'framed']
      );
      writeLines(state, `<Image ${attrs} />`);
    }
    state.closeBlock(node);
  },
  imageGroup(state, node) {
    const lines: string[] = [];
    node.forEach((img) => lines.push(imageMarkdown(state, img.attrs)));
    state.write(lines.join('\n'));
    state.closeBlock(node);
  },
  dpTable(state, node) {
    const text = (node.attrs.form === 'pipe' && pipeTable(node)) || componentTable(node);
    writeLines(state, text);
    state.closeBlock(node);
  },
  dpTableHead() {},
  dpTableBody() {},
  dpTableRow() {},
  dpTableHeader() {},
  dpTableCell() {},
  embed(state, node) {
    const a = node.attrs;
    const original = a.jsxAttrs as JsxAttr[] | null;
    const urlName =
      original?.some((x) => x.name === 'url') || !original?.some((x) => x.name === 'href') ? 'url' : 'href';
    const attrs = jsxAttributes(
      original,
      { [urlName]: String(a.url ?? ''), title: a.title ? String(a.title) : undefined },
      [urlName, 'title']
    );
    writeLines(state, `<Embed ${attrs} />`);
    state.closeBlock(node);
  },
  dpHtmlBlock(state, node) {
    writeLines(state, '<HTMLBlock>{`' + escapeTemplate(String(node.attrs.html ?? '')) + '`}</HTMLBlock>');
    state.closeBlock(node);
  },
  rawHtml(state, node) {
    writeLines(state, String(node.attrs.html ?? '').replace(/\n$/, ''));
    state.closeBlock(node);
  },
  rawMarkdown(state, node) {
    writeLines(state, String(node.attrs.markdown ?? ''));
    state.closeBlock(node);
  },
  text(state, node, parent, index) {
    writeInlineText(state, node, node.text ?? '', parent, index);
  },
  hardBreak(state, node) {
    const kind = node.attrs.kind;
    if (kind === 'html') state.write(String(node.attrs.raw || '<br>'));
    else if (kind === 'soft') state.write('\n');
    else if (kind === 'spaces') state.write('  \n');
    else state.write('\\\n');
  },
  emoji(state, node) {
    state.text(`:${String(node.attrs.name)}:`, false);
  },
  literal(state, node) {
    state.text(String(node.attrs.source ?? ''), false);
  },
  htmlInline(state, node) {
    state.text(String(node.attrs.html ?? ''), false);
  },
  image(state, node) {
    state.write(imageMarkdown(state, node.attrs));
  },
};

function linkClose(state: State, mark: Mark): string {
  const kind = mark.attrs.kind;
  if (kind === 'autolink') return '>';
  if (kind === 'linkify') return '';
  return `](${destination(String(mark.attrs.href ?? ''))}${titlePart(state, String(mark.attrs.title ?? ''))})`;
}

const link: MarkSerializerSpec = {
  open(_state, mark: Mark) {
    const kind = mark.attrs.kind;
    return kind === 'autolink' ? '<' : kind === 'linkify' ? '' : '[';
  },
  close: (state, mark: Mark) => linkClose(state, mark),
};

function delimiter(fallback: string) {
  return (_state: State, mark: Mark): string => {
    const markup = String(mark.attrs.markup ?? '');
    return /^(\*{1,2}|_{1,2})$/.test(markup) && markup.length === fallback.length ? markup : fallback;
  };
}

const marks: Record<string, MarkSerializerSpec> = {
  // The markup the author used (`*`/`_`), which keeps adjacent emphasis unambiguous as written.
  bold: { open: delimiter('**'), close: delimiter('**'), mixable: true, expelEnclosingWhitespace: true },
  italic: { open: delimiter('*'), close: delimiter('*'), mixable: true, expelEnclosingWhitespace: true },
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  link,
  code: must(defaultMarkdownSerializer.marks.code),
};

const serializer = new MarkdownSerializer(nodes, marks, {
  hardBreakNodeName: 'hardBreak',
  escapeExtraCharacters: /[<&|]/g,
  strict: true,
});
