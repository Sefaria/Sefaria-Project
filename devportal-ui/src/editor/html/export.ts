// The editor document as the server renders it (C4 HTML). Used by the golden test (TipTap's HTML for the C4
// fixtures must normalize to the Python goldens) and by the canvas for raw HTML.
//
// 1. TipTap's `renderHTML` of every node (`generateHTML` does exactly this serialization), with placeholders;
// 2. the steps a node cannot do alone, as the server does them: raw HTML substituted (with the same link
//    rewriting as renderer.py), a newline after each Markdown line break, the callout icon, the code block's final
//    newline, tight-list and lone-cell paragraphs unwrapped, heading ids (github-slugger, one counter per page),
//    HTML-block frame URLs, front matter dropped;
// 3. the C4 sanitizer.
import { getSchema, type JSONContent } from '@tiptap/core';
import { DOMSerializer, Fragment, Node as PMNode, type Schema } from '@tiptap/pm/model';
import { orderedMarks } from '../markdown/serialize';
import MarkdownIt from 'markdown-it';
import { SHORTCODES, SHORTCODE_RE, Slugger, rewriteLink } from '../markdown/dialect';
import { schemaExtensions, setCaptionRenderer, imageSpec } from '../schema/extensions';
import { sanitizeTree } from './sanitize';
import { at } from '../util';

let schemaCache: Schema | null = null;
export function editorSchema(): Schema {
  return (schemaCache ??= getSchema(schemaExtensions()));
}

export interface ExportOptions {
  /** The `<revision>` of HTML-block frame URLs (the PageRevision id). */
  revision?: string;
  /** The DOM to build with; defaults to the global document. */
  document?: Document;
  /** Skip the sanitizer (tests of the steps before it). */
  sanitize?: boolean;
}

const HTML_URL_ATTR = /(\b(?:href|src)\s*=\s*)(["'])(.*?)\2/gi;

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** renderer.py _resolve_links for raw HTML: rewrite href/src values in place. */
export function rewriteRawHtmlLinks(html: string): string {
  return html.replace(HTML_URL_ATTR, (_m, prefix: string, quote: string, value: string) => {
    const next = rewriteLink(value);
    return prefix + quote + (next !== value ? escapeAttr(next) : value) + quote;
  });
}

// --- captions: inline Markdown rendered like renderer.py (md.parseInline + renderInline) -------------------------

const captionMd = new MarkdownIt('commonmark', { html: true, breaks: true, linkify: true });
captionMd.enable(['table', 'strikethrough', 'linkify']);
captionMd.linkify.set({ fuzzyLink: false });
captionMd.core.ruler.push('dp_emoji', (state) => {
  for (const tok of state.tokens) {
    for (const child of tok.children ?? []) {
      if (child.type === 'text' && child.content.includes(':')) {
        child.content = child.content.replace(SHORTCODE_RE, (m, name: string) => SHORTCODES[name] ?? m);
      }
    }
  }
});
captionMd.renderer.rules.code_inline = (tokens, idx) =>
  `<code class="dp-code">${captionMd.utils.escapeHtml(at(tokens, idx).content)}</code>`;
captionMd.renderer.rules.image = (tokens, idx, _options, env) => {
  const tok = at(tokens, idx);
  const container = captionContainer();
  const spec = imageSpec(
    {
      src: tok.attrGet('src') ?? '',
      alt: captionMd.renderer.renderInlineAsText(tok.children ?? [], captionMd.options, env),
      title: tok.attrGet('title') ?? '',
      align: null,
      width: null,
      caption: '',
      border: null,
      framed: false,
    },
    null
  );
  container.replaceChildren(DOMSerializer.renderSpec(container.ownerDocument, spec as never).dom);
  return container.innerHTML;
};

let captionDocument: Document | null = null;
function captionContainer(): HTMLElement {
  return (captionDocument ?? document).createElement('div');
}

export function renderCaption(caption: string): string {
  const env = {};
  const children = captionMd.parseInline(caption, env)[0]?.children ?? [];
  return captionMd.renderer.renderInline(children, captionMd.options, env);
}
setCaptionRenderer(renderCaption);

// --- export -------------------------------------------------------------------------------------------------------

/** The document with each inline node's marks in source nesting order (`depth`), instead of schema rank. */
function sourceNesting(node: PMNode): PMNode {
  if (node.isInline) return node.marks.length > 1 ? node.mark(orderedMarks(node.marks)) : node;
  if (!node.childCount) return node;
  const children: PMNode[] = [];
  node.forEach((child) => children.push(sourceNesting(child)));
  return node.copy(Fragment.from(children));
}

/** TipTap's HTML for a document, before the finishing steps (what `generateHTML` returns). */
export function renderHtmlRaw(
  content: JSONContent | PMNode,
  doc: Document = document,
  nesting: 'schema' | 'source' = 'schema'
): string {
  const schema = editorSchema();
  let node = content instanceof PMNode ? content : PMNode.fromJSON(schema, content);
  if (nesting === 'source') node = sourceNesting(node);
  const container = doc.createElement('div');
  captionDocument = doc;
  try {
    container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(node.content, { document: doc }));
  } finally {
    captionDocument = null;
  }
  return container.innerHTML;
}

const RAW_PLACEHOLDER = /<dp-raw data-raw="([^"]*)"><\/dp-raw>/g;
const CAPTION_PLACEHOLDER = /<dp-rawc data-raw="([^"]*)"><\/dp-rawc>/g;
const NEWLINE_BREAK = /<br data-dp-nl="">/g;

function unwrap(el: Element): void {
  const next = el.nextSibling;
  const doc = el.ownerDocument;
  el.replaceWith(...Array.from(el.childNodes));
  // markdown-it writes a newline between a hidden paragraph and a following block.
  if (next && next.nodeType === 1) next.parentNode?.insertBefore(doc.createTextNode('\n'), next);
}

function finish(root: HTMLElement, revision: string): void {
  const doc = root.ownerDocument;
  for (const el of Array.from(root.querySelectorAll('[data-dp-editor-drop]'))) el.remove();
  for (const el of Array.from(root.querySelectorAll('blockquote[data-dp-editor-icon]'))) {
    const icon = doc.createElement('span');
    icon.className = 'dp-callout-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = el.getAttribute('data-dp-editor-icon');
    el.prepend(icon);
  }
  for (const code of Array.from(root.querySelectorAll('code[data-dp-editor-code]'))) {
    if (code.textContent) code.append(doc.createTextNode('\n'));
  }
  for (const list of Array.from(root.querySelectorAll('ul[data-dp-editor-tight], ol[data-dp-editor-tight]'))) {
    for (const li of Array.from(list.children)) {
      for (const p of Array.from(li.children)) if (p.localName === 'p') unwrap(p);
    }
  }
  for (const table of Array.from(root.querySelectorAll('table[data-dp-editor-table]'))) {
    for (const cell of Array.from(table.querySelectorAll(':scope > * > tr > th, :scope > * > tr > td'))) {
      const paras = Array.from(cell.children).filter((c) => c.localName === 'p');
      if (paras.length === 1) unwrap(at(paras, 0));
    }
  }
  const slugger = new Slugger();
  for (const h of Array.from(root.querySelectorAll('[data-dp-editor-heading]'))) {
    const textEl = h.querySelector(':scope > .dp-heading-text');
    const text = textEl?.textContent ?? '';
    if (!text.trim()) {
      h.remove();
      continue;
    }
    const id = slugger.slug(text);
    h.setAttribute('id', id);
    const anchor = h.querySelector(':scope > .dp-heading-anchor');
    anchor?.setAttribute('href', '#' + id);
    anchor?.setAttribute('aria-label', 'Skip link to ' + text);
  }
  Array.from(root.querySelectorAll('iframe[data-dp-editor-htmlblock]')).forEach((frame, n) => {
    frame.setAttribute('src', `/_portal/htmlblock/${revision}/${n}`);
    frame.setAttribute('title', `HTML block ${n + 1}`);
  });
}

/** The server's HTML for an editor document (see the header comment). */
export function exportHtml(content: JSONContent | PMNode, options: ExportOptions = {}): string {
  const doc = options.document ?? document;
  let html = renderHtmlRaw(content, doc, 'source');
  html = html.replace(RAW_PLACEHOLDER, (_m, raw: string) => rewriteRawHtmlLinks(decodeURIComponent(raw)));
  html = html.replace(CAPTION_PLACEHOLDER, (_m, raw: string) => decodeURIComponent(raw));
  html = html.replace(NEWLINE_BREAK, '<br>\n');
  const root = doc.createElement('div');
  root.innerHTML = html;
  finish(root, options.revision ?? '0');
  if (options.sanitize !== false) sanitizeTree(root);
  return root.innerHTML;
}
