// Markdown (C4 dialect) → editor document, keeping the source (PLAN §2.11 "Lossless round trip").
//
// The body is tokenized by ./md.ts. Each top-level block becomes exactly one top-level node, which records:
// - `mdSrc`: the exact source lines the block came from;
// - `mdLead`: everything between the previous block and this one (blank lines, reference definitions, …).
// What follows the last block is the document's `trail`; front matter is a `rawMarkdown` node of its own. So the
// concatenation of every `mdLead + mdSrc` plus `trail` is the input, byte for byte, and ./serialize.ts writes a clean
// node's `src` back unchanged (RT-1). A block the converter does not model becomes `rawMarkdown`, shown as source
// and written back verbatim, so nothing can be dropped.
import type { JSONContent } from '@tiptap/core';
import type Token from 'markdown-it/lib/token.mjs';
import { CALLOUT_EMOJI, CALLOUT_EMOJI_ORDER, SHORTCODES, SHORTCODE_RE, ALIGNS, splitFrontMatter } from './dialect';
import { attrValue, createMarkdownIt, type CalloutMeta, type HtmlBlockMeta, type JsxAttr, type TableMeta } from './md';
import { at, must } from '../util';

type Mark = { type: string; attrs?: Record<string, unknown> };

class Unsupported extends Error {}

const md = createMarkdownIt();
const BR = /^<br\s*\/?>$/i;

/** Line start offsets of `text`; `offset(line)` past the end is `text.length`. */
function lineOffsets(text: string): (line: number) => number {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return (line) => starts[line] ?? text.length;
}

/** The editor document for a page body (or a whole file with front matter). */
export function parseMarkdown(source: string): JSONContent {
  const [front, body] = splitFrontMatter(source);
  const content: JSONContent[] = [];
  if (front !== null) {
    content.push({
      type: 'rawMarkdown',
      attrs: { kind: 'frontmatter', markdown: front.replace(/\n$/, ''), mdSrc: front, mdLead: '' },
    });
  }
  const env = {};
  const tokens = parseKeepingBom(body, env);
  const offset = lineOffsets(body);
  let prevEnd = 0;
  for (const [start, end] of topLevelBlocks(tokens)) {
    const map = must(at(tokens, start).map, 'block map');
    const lead = body.slice(offset(prevEnd), offset(map[0]));
    const src = body.slice(offset(map[0]), offset(map[1]));
    prevEnd = map[1];
    let node: JSONContent;
    try {
      const nodes = convertBlocks(tokens.slice(start, end), env, true);
      if (nodes.length !== 1) throw new Unsupported('one block, several nodes');
      node = at(nodes, 0);
    } catch (error) {
      if (!(error instanceof Unsupported)) throw error;
      node = rawMarkdown(src);
    }
    node.attrs = { ...node.attrs, mdSrc: src, mdLead: lead };
    content.push(node);
  }
  if (content.length === 0) content.push({ type: 'paragraph', attrs: { mdSrc: '', mdLead: '' } });
  return { type: 'doc', attrs: { trail: body.slice(offset(prevEnd)) }, content };
}

// JavaScript's trim() removes U+FEFF; Python's strip(), which the server's markdown-it-py uses, keeps it (a line
// holding only a BOM is a paragraph on the server). Tokenize with a stand-in of the same length, then put it back.
const BOM = '\ufeff';
const BOM_STAND_IN = '\ue000';

function restoreBom<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll(BOM_STAND_IN, BOM) as T;
  if (Array.isArray(value)) return value.map(restoreBom) as T;
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const record = value as Record<string, unknown>;
      record[key] = restoreBom(record[key]);
    }
  }
  return value;
}

function parseKeepingBom(source: string, env: object): Token[] {
  if (!source.includes(BOM)) return md.parse(source, env);
  const tokens = md.parse(source.replaceAll(BOM, BOM_STAND_IN), env);
  for (const tok of tokens) {
    tok.content = restoreBom(tok.content);
    tok.info = restoreBom(tok.info);
    tok.attrs = restoreBom(tok.attrs);
    tok.meta = restoreBom(tok.meta);
    for (const child of tok.children ?? []) {
      child.content = restoreBom(child.content);
      child.attrs = restoreBom(child.attrs);
      child.markup = restoreBom(child.markup);
      if (child.children) for (const c of child.children) c.content = restoreBom(c.content);
    }
  }
  return tokens;
}

/** Markdown for a fragment (a callout's or a cell's inside): nodes without source bookkeeping. */
export function parseFragment(source: string, env: object = {}): JSONContent[] {
  const nodes = convertBlocks(parseKeepingBom(source, env), env, false);
  return nodes.length ? nodes : [{ type: 'paragraph' }];
}

function rawMarkdown(src: string): JSONContent {
  return { type: 'rawMarkdown', attrs: { kind: 'unknown', markdown: src.replace(/\n$/, '') } };
}

/** `[start, end)` token ranges of the top-level blocks. */
function* topLevelBlocks(tokens: Token[]): Generator<[number, number]> {
  let i = 0;
  while (i < tokens.length) {
    const tok = at(tokens, i);
    if (tok.nesting === 1) {
      let depth = 0;
      let j = i;
      for (; j < tokens.length; j++) {
        depth += at(tokens, j).nesting;
        if (depth === 0) break;
      }
      yield [i, j + 1];
      i = j + 1;
    } else {
      yield [i, i + 1];
      i++;
    }
  }
}

function closing(tokens: Token[], i: number): number {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    depth += at(tokens, j).nesting;
    if (depth === 0) return j;
  }
  throw new Unsupported('unbalanced tokens');
}

function inlineText(children: Token[] | null): string {
  let out = '';
  for (const c of children ?? []) {
    if (c.type === 'text' || c.type === 'code_inline' || c.type === 'text_special') out += c.content;
    else if (c.type === 'softbreak' || c.type === 'hardbreak') out += '\n';
    else if (c.children) out += inlineText(c.children);
  }
  return out;
}

function convertBlocks(tokens: Token[], env: object, topLevel: boolean): JSONContent[] {
  const out: JSONContent[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = at(tokens, i);
    const end = tok.nesting === 1 ? closing(tokens, i) : i;
    const inner = tokens.slice(i + 1, end);
    out.push(...convertBlock(tok, inner, env, topLevel));
    i = end + 1;
  }
  return out;
}

function convertBlock(tok: Token, inner: Token[], env: object, topLevel: boolean): JSONContent[] {
  switch (tok.type) {
    case 'paragraph_open':
      return paragraph(at(inner, 0), topLevel);
    case 'heading_open':
      return [{ type: 'heading', attrs: { level: Number(tok.tag.slice(1)) }, content: inline(at(inner, 0).children) }];
    case 'blockquote_open':
      return [blockquote(inner, env)];
    case 'bullet_list_open':
      return [
        { type: 'bulletList', attrs: { bullet: tok.markup || '*', tight: isTight(inner) }, content: items(inner, env) },
      ];
    case 'ordered_list_open': {
      const start = Number(tok.attrGet('start') ?? 1);
      return [
        {
          type: 'orderedList',
          attrs: { start, delimiter: tok.markup || '.', tight: isTight(inner) },
          content: items(inner, env),
        },
      ];
    }
    case 'fence': {
      const info = md.utils.unescapeAll(tok.info).trim();
      const space = info.search(/\s/);
      const language = space < 0 ? info : info.slice(0, space);
      const title = space < 0 ? '' : info.slice(space).trim();
      return [codeBlock(tok.content, { language, title, fence: tok.markup })];
    }
    case 'code_block':
      return [codeBlock(tok.content, { indented: true })];
    case 'hr':
      return [{ type: 'horizontalRule', attrs: { markup: tok.markup } }];
    case 'html_block':
      return [{ type: 'rawHtml', attrs: { html: tok.content } }];
    case 'table_open':
      return [pipeTable(inner)];
    case 'dp_callout':
      return [componentCallout(tok.meta as CalloutMeta, env)];
    case 'dp_table':
      return [componentTable(tok.meta as TableMeta, env)];
    case 'dp_image':
      return [componentImage((tok.meta as { attrs: JsxAttr[] }).attrs)];
    case 'dp_embed':
      return [embed((tok.meta as { attrs: JsxAttr[] }).attrs)];
    case 'dp_htmlblock':
      return [{ type: 'dpHtmlBlock', attrs: { html: (tok.meta as HtmlBlockMeta).html } }];
    default:
      throw new Unsupported(tok.type);
  }
}

function codeBlock(content: string, attrs: Record<string, unknown>): JSONContent {
  const text = content.endsWith('\n') ? content.slice(0, -1) : content;
  return { type: 'codeBlock', attrs, content: text ? [{ type: 'text', text }] : [] };
}

function paragraph(inlineToken: Token, topLevel: boolean): JSONContent[] {
  const children = inlineToken.children ?? [];
  const images = children.filter((c) => c.type === 'image');
  const others = children.filter(
    (c) =>
      c.type !== 'image' &&
      !(c.type === 'text' && !c.content.trim()) &&
      c.type !== 'softbreak' &&
      c.type !== 'hardbreak'
  );
  if (images.length && !others.length) {
    // A paragraph holding only images renders one block image per image (renderer.py _image_paragraphs).
    const nodes = images.map((img) => ({
      type: 'dpImage',
      attrs: {
        form: 'markdown',
        src: img.attrGet('src') ?? '',
        alt: inlineText(img.children),
        altSrc: img.content,
        title: img.attrGet('title') ?? '',
      },
    }));
    return nodes.length > 1 && topLevel ? [{ type: 'imageGroup', content: nodes }] : nodes;
  }
  return [{ type: 'paragraph', content: inline(children) }];
}

function blockquote(inner: Token[], env: object): JSONContent {
  // A blockquote whose first line starts with a theme emoji is a callout (renderer.py _blockquote_callouts).
  const [pOpen, inl] = inner;
  const first = inl?.children?.[0];
  if (pOpen?.type === 'paragraph_open' && inl?.type === 'inline' && first?.type === 'text') {
    const emoji = CALLOUT_EMOJI_ORDER.find((e) => first.content.startsWith(e));
    const restOfLine = emoji ? first.content.slice(emoji.length) : '';
    if (emoji && (!restOfLine || restOfLine[0] === ' ' || restOfLine[0] === '\t')) {
      const children = (inl.children ?? []).map(
        (c) => Object.assign(Object.create(Object.getPrototypeOf(c)), c) as Token
      );
      at(children, 0).content = restOfLine.replace(/^\s+/, '');
      const brk = children.findIndex((c) => c.type === 'softbreak' || c.type === 'hardbreak');
      const title = brk < 0 ? children : children.slice(0, brk);
      const rest = brk < 0 ? [] : children.slice(brk + 1);
      const last = title[title.length - 1];
      if (last?.type === 'text') last.content = last.content.replace(/\s+$/, '');
      const content: JSONContent[] = [];
      if (inlineText(title).trim()) {
        content.push({ type: 'heading', attrs: { level: 3, calloutTitle: true }, content: inline(title) });
      }
      if (rest.length) content.push({ type: 'paragraph', content: inline(rest) });
      const pClose = closing(inner, 0);
      content.push(...convertBlocks(inner.slice(pClose + 1), env, false));
      if (!content.length) content.push({ type: 'paragraph' });
      return {
        type: 'callout',
        attrs: { form: 'blockquote', theme: CALLOUT_EMOJI[emoji] ?? 'default', icon: emoji },
        content,
      };
    }
  }
  return { type: 'blockquote', content: nonEmpty(convertBlocks(inner, env, false)) };
}

function nonEmpty(nodes: JSONContent[]): JSONContent[] {
  return nodes.length ? nodes : [{ type: 'paragraph' }];
}

function isTight(inner: Token[]): boolean {
  const para = inner.find((t) => t.type === 'paragraph_open');
  return para ? para.hidden : true;
}

function items(inner: Token[], env: object): JSONContent[] {
  const out: JSONContent[] = [];
  let i = 0;
  while (i < inner.length) {
    const end = closing(inner, i);
    out.push({ type: 'listItem', content: nonEmpty(convertBlocks(inner.slice(i + 1, end), env, false)) });
    i = end + 1;
  }
  return out;
}

function cellAlign(style: string | null): string | null {
  const m = /text-align:\s*(left|center|right)/.exec(style ?? '');
  return m?.[1] ?? null;
}

function pipeTable(inner: Token[]): JSONContent {
  const sections: JSONContent[] = [];
  let i = 0;
  while (i < inner.length) {
    const tok = at(inner, i);
    const end = closing(inner, i);
    if (tok.type === 'thead_open' || tok.type === 'tbody_open') {
      const rows: JSONContent[] = [];
      const body = inner.slice(i + 1, end);
      let r = 0;
      while (r < body.length) {
        const rEnd = closing(body, r);
        const cells: JSONContent[] = [];
        const cellTokens = body.slice(r + 1, rEnd);
        for (let c = 0; c < cellTokens.length; c += 3) {
          const open = at(cellTokens, c);
          const children = inline(at(cellTokens, c + 1).children);
          cells.push({
            type: open.type === 'th_open' ? 'dpTableHeader' : 'dpTableCell',
            attrs: { align: cellAlign(open.attrGet('style')) },
            content: [{ type: 'paragraph', content: children }],
          });
        }
        rows.push({ type: 'dpTableRow', content: cells });
        r = rEnd + 1;
      }
      sections.push({ type: tok.type === 'thead_open' ? 'dpTableHead' : 'dpTableBody', content: rows });
    }
    i = end + 1;
  }
  return { type: 'dpTable', attrs: { form: 'pipe', align: [] }, content: sections };
}

function componentTable(meta: TableMeta, env: object): JSONContent {
  const align = meta.align;
  const section = (name: 'thead' | 'tbody', type: string): JSONContent | null => {
    const rows = meta.rows.filter((row) => row.section === name);
    if (!rows.length) return null;
    return {
      type,
      content: rows.map((row) => ({
        type: 'dpTableRow',
        content: row.cells.map((cell, col) => {
          const a = align[col];
          return {
            type: cell.tag === 'th' ? 'dpTableHeader' : 'dpTableCell',
            attrs: { align: typeof a === 'string' && (ALIGNS as readonly string[]).includes(a) ? a : null },
            content: parseFragment(cell.source, env),
          };
        }),
      })),
    };
  };
  const content = [section('thead', 'dpTableHead'), section('tbody', 'dpTableBody')].filter(
    (s): s is JSONContent => s !== null
  );
  // A row without cells has no editor representation; keep such a table as source.
  if (!content.length || meta.rows.some((row) => row.cells.length === 0)) throw new Unsupported('empty table');
  return { type: 'dpTable', attrs: { form: 'component', align, jsxAttrs: meta.attrs }, content };
}

function componentCallout(meta: CalloutMeta, env: object): JSONContent {
  const theme = attrValue(meta.attrs, 'theme');
  const icon = attrValue(meta.attrs, 'icon');
  return {
    type: 'callout',
    attrs: {
      form: 'component',
      theme: typeof theme === 'string' ? theme : 'default',
      icon: typeof icon === 'string' ? icon : null,
      jsxAttrs: meta.attrs,
    },
    content: parseFragment(meta.source, env),
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function componentImage(attrs: JsxAttr[]): JSONContent {
  const width = attrValue(attrs, 'width');
  const border = attrValue(attrs, 'border');
  return {
    type: 'dpImage',
    attrs: {
      form: 'component',
      src: str(attrValue(attrs, 'src')),
      alt: str(attrValue(attrs, 'alt')),
      title: str(attrValue(attrs, 'title')),
      align: typeof attrValue(attrs, 'align') === 'string' ? attrValue(attrs, 'align') : null,
      width:
        typeof width === 'string' ? width : typeof width === 'number' && Number.isInteger(width) ? String(width) : null,
      caption: str(attrValue(attrs, 'caption')),
      border: typeof border === 'boolean' ? border : null,
      framed: attrValue(attrs, 'framed') === true,
      jsxAttrs: attrs,
    },
  };
}

function embed(attrs: JsxAttr[]): JSONContent {
  const url = str(attrValue(attrs, 'url')) || str(attrValue(attrs, 'href'));
  return { type: 'embed', attrs: { url, title: str(attrValue(attrs, 'title')), jsxAttrs: attrs } };
}

// --- inline -------------------------------------------------------------------------------------------------------

function textNodes(text: string, marks: Mark[]): JSONContent[] {
  const out: JSONContent[] = [];
  const withMarks = (node: JSONContent): JSONContent => (marks.length ? { ...node, marks: [...marks] } : node);
  let last = 0;
  for (const m of text.matchAll(SHORTCODE_RE)) {
    const name = m[1] ?? '';
    const char = SHORTCODES[name];
    if (!char) continue;
    if (m.index > last) out.push(withMarks({ type: 'text', text: text.slice(last, m.index) }));
    out.push(withMarks({ type: 'emoji', attrs: { name: m[1], char } }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(withMarks({ type: 'text', text: text.slice(last) }));
  return out;
}

let spanCounter = 0;

function inline(children: Token[] | null): JSONContent[] {
  const out: JSONContent[] = [];
  const marks: Mark[] = [];
  const open = (type: string, attrs: Record<string, unknown> = {}) =>
    marks.push({ type, attrs: { ...attrs, span: ++spanCounter, depth: marks.length } });
  const add = (node: JSONContent) => out.push(marks.length ? { ...node, marks: [...marks] } : node);
  const pop = (type: string) => {
    for (let k = marks.length - 1; k >= 0; k--) {
      if (at(marks, k).type === type) {
        marks.splice(k, 1);
        return;
      }
    }
  };
  for (const c of children ?? []) {
    switch (c.type) {
      case 'text':
        if (c.content) out.push(...textNodes(c.content, marks));
        break;
      case 'text_special':
        add({ type: 'literal', attrs: { text: c.content, source: c.markup } });
        break;
      case 'softbreak':
        add({ type: 'hardBreak', attrs: { kind: 'soft' } });
        break;
      case 'hardbreak':
        add({ type: 'hardBreak', attrs: { kind: 'backslash' } });
        break;
      case 'code_inline':
        if (c.content) {
          const code = { type: 'code', attrs: { markup: c.markup, span: ++spanCounter, depth: marks.length } };
          out.push({ type: 'text', text: c.content, marks: [...marks, code] });
        } else add({ type: 'htmlInline', attrs: { html: c.markup + c.markup } });
        break;
      case 'strong_open':
        open('bold', { markup: c.markup });
        break;
      case 'em_open':
        open('italic', { markup: c.markup });
        break;
      case 's_open':
        open('strike');
        break;
      case 'link_open':
        open('link', {
          href: c.attrGet('href') ?? '',
          title: c.attrGet('title') ?? '',
          kind: c.markup === 'linkify' ? 'linkify' : c.markup === 'autolink' ? 'autolink' : 'inline',
        });
        break;
      case 'strong_close':
        pop('bold');
        break;
      case 'em_close':
        pop('italic');
        break;
      case 's_close':
        pop('strike');
        break;
      case 'link_close':
        pop('link');
        break;
      case 'image':
        add({
          type: 'image',
          attrs: {
            src: c.attrGet('src') ?? '',
            alt: inlineText(c.children),
            title: c.attrGet('title') ?? '',
            altSrc: c.content,
          },
        });
        break;
      case 'html_inline':
        if (BR.test(c.content)) add({ type: 'hardBreak', attrs: { kind: 'html', raw: c.content } });
        else add({ type: 'htmlInline', attrs: { html: c.content } });
        break;
      default:
        throw new Unsupported('inline ' + c.type);
    }
  }
  return out;
}
