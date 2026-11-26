// The editor's markdown-it: the same tokenizer configuration as the server's markdown-it-py
// (devportal/markdown/renderer.py make_parser) plus the five ReadMe component block rules
// (devportal/markdown/components.py), ported line for line. Differences, on purpose:
// - `text_join` is off, so entities and backslash escapes stay `text_special` tokens and the editor can keep
//   their source; the server joins them into text, which renders the same characters.
// - Component tokens carry their inner *source* (`meta.source`, `meta.rows[].cells[].source`), because the
//   editor parses it into nodes itself; the server carries parsed tokens.
import MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { at } from '../util';

export type JsxValue = string | boolean | number | null | JsxValue[] | { [key: string]: JsxValue };

/** One attribute of a component tag, with enough of its source to write it back the same way. */
export interface JsxAttr {
  name: string;
  value: JsxValue;
  /** `"`, `'`, `{` (expression) or `` (bare boolean). */
  quote: '"' | "'" | '{' | '';
  /** The expression's source for `{…}` values. */
  raw?: string;
}

export interface ScannedTag {
  name: string;
  attrs: JsxAttr[];
  end: number;
  selfClosing: boolean;
}

const NAME = /[A-Za-z_][\w-]*/y;

function exprValue(expr: string): JsxValue {
  const text = expr.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  try {
    return JSON.parse(text) as JsxValue;
  } catch {
    return text;
  }
}

/** Scan a JSX-style open tag at `src[pos] === '<'` (components.py scan_tag). */
export function scanTag(src: string, pos: number): ScannedTag | null {
  NAME.lastIndex = pos + 1;
  const m = NAME.exec(src);
  if (!m) return null;
  const name = m[0];
  let i = NAME.lastIndex;
  const attrs: JsxAttr[] = [];
  const n = src.length;
  while (i < n) {
    while (i < n && /\s/.test(src.charAt(i))) i++;
    if (i >= n) return null;
    if (src.startsWith('/>', i)) return { name, attrs, end: i + 2, selfClosing: true };
    if (src[i] === '>') return { name, attrs, end: i + 1, selfClosing: false };
    NAME.lastIndex = i;
    const am = NAME.exec(src);
    if (!am) return null;
    const key = am[0];
    i = NAME.lastIndex;
    while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
    if (i < n && src[i] === '=') {
      i++;
      while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
      if (i >= n) return null;
      const q = src.charAt(i);
      if (q === '"' || q === "'") {
        const end = src.indexOf(q, i + 1);
        if (end < 0) return null;
        attrs.push({ name: key, value: src.slice(i + 1, end), quote: q });
        i = end + 1;
      } else if (q === '{') {
        let depth = 0;
        let j = i;
        let inStr: string | null = null;
        while (j < n) {
          const c = src.charAt(j);
          if (inStr) {
            if (c === '\\') j++;
            else if (c === inStr) inStr = null;
          } else if (c === '"' || c === "'" || c === '`') inStr = c;
          else if (c === '{') depth++;
          else if (c === '}') {
            depth--;
            if (depth === 0) break;
          }
          j++;
        }
        if (j >= n) return null;
        const raw = src.slice(i + 1, j);
        attrs.push({ name: key, value: exprValue(raw), quote: '{', raw });
        i = j + 1;
      } else {
        return null;
      }
    } else {
      attrs.push({ name: key, value: true, quote: '' });
    }
  }
  return null;
}

/** Attribute lookup with Python dict semantics (the last duplicate wins). */
export function attrValue(attrs: readonly JsxAttr[], name: string): JsxValue | undefined {
  let found: JsxValue | undefined;
  for (const a of attrs) if (a.name === name) found = a.value;
  return found;
}

const START = /^<(Callout|Image|Embed|Table|HTMLBlock)(?=[\s/>]|$)/;

function lineText(state: StateBlock, line: number): string {
  return state.src.slice(at(state.bMarks, line) + at(state.tShift, line), state.eMarks[line]);
}

function blockText(state: StateBlock, start: number, end: number): string {
  return state.getLines(start, end, state.blkIndent, false);
}

function findClose(state: StateBlock, start: number, end: number, name: string): number | null {
  let depth = 0;
  const open = new RegExp('<' + name + '(?=[\\s>])', 'g');
  const close = '</' + name + '>';
  for (let line = start; line < end; line++) {
    const text = lineText(state, line);
    depth += (text.match(open) ?? []).length;
    depth -= text.split(close).length - 1;
    if (depth <= 0 && text.includes(close)) return line;
  }
  return null;
}

/** components.py _dedent: drop leading and trailing blank lines, then textwrap.dedent. */
export function dedent(text: string): string {
  const lines = text.split('\n');
  while (lines.length && !at(lines, 0).trim()) lines.shift();
  while (lines.length && !at(lines, lines.length - 1).trim()) lines.pop();
  let margin: string | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    if (margin === null) margin = indent;
    else {
      let k = 0;
      while (k < margin.length && k < indent.length && margin[k] === indent[k]) k++;
      margin = margin.slice(0, k);
    }
  }
  const cut = margin ?? '';
  // textwrap.dedent also turns whitespace-only lines into empty lines.
  return lines.map((line) => (line.trim() ? line.slice(cut.length) : '')).join('\n');
}

function tagFrom(state: StateBlock, startLine: number, endLine: number): [ScannedTag, number] | null {
  const text = blockText(state, startLine, Math.min(endLine, startLine + 60)).replace(/^ +/, '');
  const tag = scanTag(text, 0);
  if (tag === null) return null;
  return [tag, startLine + (text.slice(0, tag.end).match(/\n/g) ?? []).length];
}

function push(state: StateBlock, type: string, tag: string, start: number, next: number, meta: unknown): Token {
  const token = state.push(type, tag, 0);
  token.block = true;
  token.map = [start, next];
  token.meta = meta;
  state.line = next;
  return token;
}

export interface CalloutMeta {
  attrs: JsxAttr[];
  source: string;
}
export interface TableCellMeta {
  tag: 'th' | 'td';
  source: string;
}
export interface TableRowMeta {
  section: 'thead' | 'tbody';
  cells: TableCellMeta[];
}
export interface TableMeta {
  attrs: JsxAttr[];
  align: unknown[];
  rows: TableRowMeta[];
}
export interface HtmlBlockMeta {
  index: number;
  html: string;
}

function callout(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const scanned = tagFrom(state, startLine, endLine);
  if (scanned === null || scanned[0].selfClosing) return false;
  const close = findClose(state, startLine, endLine, 'Callout');
  if (close === null) return false;
  if (silent) return true;
  const [tag] = scanned;
  let body = blockText(state, startLine, close + 1)
    .replace(/^ +/, '')
    .slice(tag.end);
  body = body.slice(0, body.lastIndexOf('</Callout>'));
  const meta: CalloutMeta = { attrs: tag.attrs, source: dedent(body) };
  push(state, 'dp_callout', 'blockquote', startLine, close + 1, meta);
  return true;
}

function selfClosing(type: string, tagName: string) {
  return (state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
    const scanned = tagFrom(state, startLine, endLine);
    if (scanned === null) return false;
    const [tag, tagEnd] = scanned;
    let next = tagEnd + 1;
    if (!tag.selfClosing) {
      const close = findClose(state, startLine, endLine, tagName);
      if (close === null) return false;
      next = close + 1;
    }
    if (silent) return true;
    push(state, type, 'div', startLine, next, { attrs: tag.attrs, selfClosing: tag.selfClosing });
    return true;
  };
}

const CELL = /<(\/?)(thead|tbody|tr|th|td)\b([^>]*)>/gi;

function table(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const scanned = tagFrom(state, startLine, endLine);
  if (scanned === null || scanned[0].selfClosing) return false;
  const close = findClose(state, startLine, endLine, 'Table');
  if (close === null) return false;
  if (silent) return true;
  const [tag] = scanned;
  let body = blockText(state, startLine, close + 1)
    .replace(/^ +/, '')
    .slice(tag.end);
  body = body.slice(0, body.lastIndexOf('</Table>'));
  const rows: TableRowMeta[] = [];
  let section: 'thead' | 'tbody' = 'tbody';
  let row: TableRowMeta | null = null;
  let cell: { tag: 'th' | 'td'; start: number } | null = null;
  for (const m of body.matchAll(CELL)) {
    const closing = m[1] === '/';
    const name = (m[2] ?? '').toLowerCase();
    if (name === 'thead' || name === 'tbody') {
      section = closing ? 'tbody' : (name as 'thead' | 'tbody');
    } else if (name === 'tr') {
      if (!closing) {
        row = { section, cells: [] };
        rows.push(row);
      } else row = null;
    } else if (!closing) {
      cell = { tag: name as 'th' | 'td', start: m.index + m[0].length };
    } else if (cell !== null && cell.tag === name) {
      if (row === null) {
        row = { section, cells: [] };
        rows.push(row);
      }
      row.cells.push({ tag: cell.tag, source: dedent(body.slice(cell.start, m.index)) });
      cell = null;
    }
  }
  const align = attrValue(tag.attrs, 'align');
  const meta: TableMeta = { attrs: tag.attrs, align: Array.isArray(align) ? align : [], rows };
  push(state, 'dp_table', 'table', startLine, close + 1, meta);
  return true;
}

/** components.py _unescape_template: `\``, `\\`, `\$` inside the template literal. */
export function unescapeTemplate(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === '\\' && i + 1 < text.length && '`\\$'.includes(text.charAt(i + 1))) {
      out += text[i + 1];
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

export function escapeTemplate(html: string): string {
  return html.replace(/[\\`]/g, '\\$&').replace(/\$\{/g, '\\${');
}

function htmlblock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const close = findClose(state, startLine, endLine, 'HTMLBlock');
  if (close === null) return false;
  const body = blockText(state, startLine, close + 1).replace(/^ +/, '');
  const m = /^<HTMLBlock(\s[^>]*)?>\s*\{`/.exec(body);
  const end = body.lastIndexOf('`}</HTMLBlock>');
  if (!m || end < m[0].length) return false;
  if (silent) return true;
  const env = state.env as { dp_htmlblocks?: string[] };
  const blocks = (env.dp_htmlblocks ??= []);
  const html = unescapeTemplate(body.slice(m[0].length, end));
  blocks.push(html);
  const meta: HtmlBlockMeta = { index: blocks.length - 1, html };
  push(state, 'dp_htmlblock', 'div', startLine, close + 1, meta);
  return true;
}

const HANDLERS: Record<string, (s: StateBlock, a: number, b: number, silent: boolean) => boolean> = {
  Callout: callout,
  Image: selfClosing('dp_image', 'Image'),
  Embed: selfClosing('dp_embed', 'Embed'),
  Table: table,
  HTMLBlock: htmlblock,
};

function componentRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (at(state.sCount, startLine) - state.blkIndent >= 4) return false;
  const m = START.exec(lineText(state, startLine));
  if (!m) return false;
  const handler = HANDLERS[m[1] ?? ''];
  return handler ? handler(state, startLine, endLine, silent) : false;
}

/** The tokenizer the editor parses with. */
export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt('commonmark', {
    html: true,
    typographer: false,
    xhtmlOut: false,
    breaks: true,
    linkify: true,
  });
  md.enable(['table', 'strikethrough', 'linkify']);
  md.linkify.set({ fuzzyLink: false });
  md.core.ruler.disable('text_join');
  md.block.ruler.before('html_block', 'dp_component', componentRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  return md;
}
