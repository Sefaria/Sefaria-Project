// The editor's document schema: one TipTap node or mark per construct of the C4 dialect
// (devportal/contracts/DIALECT.md). `renderHTML` writes the C4 markup, so the canvas is styled by article.css as the
// public page is, and `exportHtml` (../html/export.ts) turns the same output into the server's HTML. Where the
// server's markup depends on context a node cannot see (heading ids, the n-th HTML block, a cell's lone paragraph,
// tight lists, the callout icon, the newline after a line break), the node writes a `data-dp-editor-*` marker and
// `exportHtml` finishes the job. Raw HTML is carried as `<dp-raw>` placeholders and substituted before sanitizing,
// as the server sanitizes the HTML it renders.
//
// Every block node has two bookkeeping attributes used by the source-preserving serializer
// (../markdown/serialize.ts): `mdSrc`, the exact source lines of a top-level block (null once it is edited), and
// `mdLead`, the source between the previous block and this one (blank lines, reference definitions).
import { Extension, Mark, Node, mergeAttributes, type Extensions } from '@tiptap/core';
import { rewriteLink, resolveTheme, THEME_ICONS, codeLabel, WIDTH_RE, ALIGNS, YOUTUBE_RE } from '../markdown/dialect';
import type { JsxAttr } from '../markdown/md';

type Attrs = Record<string, unknown>;
type Spec = [string, ...unknown[]];

const plain = (value: unknown) => ({ default: value, rendered: false });

export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'callout',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
  'dpImage',
  'imageGroup',
  'dpTable',
  'embed',
  'dpHtmlBlock',
  'rawHtml',
  'rawMarkdown',
] as const;

/** `mdSrc` and `mdLead` on every block (see the header comment). Never rendered. */
const SourceAttributes = Extension.create({
  name: 'dpSource',
  addGlobalAttributes() {
    return [{ types: [...BLOCK_TYPES], attributes: { mdSrc: plain(null), mdLead: plain('') } }];
  },
});

export function rawPlaceholder(html: string): Spec {
  return ['dp-raw', { 'data-raw': encodeURIComponent(html) }];
}

const Doc = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block+',
  addAttributes() {
    return { trail: plain('') };
  },
});

const Text = Node.create({ name: 'text', group: 'inline' });

const Paragraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  priority: 1000,
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: () => ['p', 0],
});

const Heading = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return { level: plain(2), calloutTitle: plain(false) };
  },
  parseHTML: () => [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML({ node }) {
    const level = node.attrs.level as number;
    return [
      `h${level}`,
      { class: `dp-heading dp-heading-${level}`, 'data-dp-editor-heading': '' },
      ['span', { class: 'dp-heading-text' }, 0],
      ['a', { class: 'dp-heading-anchor', contenteditable: 'false' }],
    ];
  },
});

const Blockquote = Node.create({
  name: 'blockquote',
  group: 'block',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'blockquote' }],
  renderHTML: () => ['blockquote', 0],
});

/** Both callout forms. `theme` and `icon` are kept as typed; rendering resolves them like the server. */
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      theme: plain('default'),
      icon: plain(null),
      form: plain('component'),
      jsxAttrs: plain(null),
    };
  },
  renderHTML({ node }) {
    const theme = resolveTheme(node.attrs.theme);
    const icon = typeof node.attrs.icon === 'string' ? node.attrs.icon : THEME_ICONS[theme];
    return ['blockquote', { class: `dp-callout dp-callout-${theme}`, 'data-dp-editor-icon': icon }, 0];
  },
});

const BulletList = Node.create({
  name: 'bulletList',
  group: 'block list',
  content: 'listItem+',
  addAttributes() {
    return { tight: plain(true), bullet: plain('*') };
  },
  parseHTML: () => [{ tag: 'ul' }],
  renderHTML: ({ node }) => ['ul', node.attrs.tight ? { 'data-dp-editor-tight': '' } : {}, 0],
});

const OrderedList = Node.create({
  name: 'orderedList',
  group: 'block list',
  content: 'listItem+',
  addAttributes() {
    return { tight: plain(true), start: plain(1), delimiter: plain('.') };
  },
  parseHTML: () => [{ tag: 'ol' }],
  renderHTML({ node }) {
    const attrs: Attrs = {};
    if (node.attrs.start !== 1) attrs.start = String(node.attrs.start);
    if (node.attrs.tight) attrs['data-dp-editor-tight'] = '';
    return ['ol', attrs, 0];
  },
});

const ListItem = Node.create({
  name: 'listItem',
  content: 'block+',
  defining: true,
  parseHTML: () => [{ tag: 'li' }],
  renderHTML: () => ['li', 0],
});

/** Fenced or indented code. A language gives the code-tab chrome; `title` is the tab label (F-4). */
const CodeBlock = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  addAttributes() {
    return { language: plain(''), title: plain(''), fence: plain('```'), indented: plain(false) };
  },
  parseHTML: () => [{ tag: 'pre', preserveWhitespace: 'full' }],
  renderHTML({ node }) {
    const lang = node.attrs.language as string;
    const code: Attrs = { class: 'dp-code', 'data-dp-editor-code': '' };
    if (!lang) return ['pre', { class: 'dp-pre' }, ['code', code, 0]];
    code['data-lang'] = lang;
    return [
      'div',
      { class: 'dp-codetabs' },
      [
        'div',
        { class: 'dp-codetabs-toolbar', contenteditable: 'false' },
        [
          'button',
          { type: 'button', class: 'dp-codetabs-tab dp-active', value: lang },
          codeLabel(lang, node.attrs.title as string),
        ],
      ],
      ['div', { class: 'dp-codetabs-inner' }, ['pre', { class: 'dp-pre' }, ['code', code, 0]]],
    ];
  },
});

const HorizontalRule = Node.create({
  name: 'horizontalRule',
  group: 'block',
  atom: true,
  addAttributes() {
    return { markup: plain('---') };
  },
  parseHTML: () => [{ tag: 'hr' }],
  renderHTML: () => ['hr'],
});

export interface ImageAttrs {
  src: string;
  alt: string;
  title: string;
  align: string | null;
  width: string | null;
  caption: string;
  border: boolean | null;
  framed: boolean;
}

/** The lightbox markup of an image (renderer.py _image_html), without the block wrapper. */
export function imageSpec(a: ImageAttrs, captionHtml: string | null): Spec {
  const align = a.align && (ALIGNS as readonly string[]).includes(a.align) ? a.align : null;
  const width = typeof a.width === 'string' ? a.width.trim() : null;
  const classes = ['dp-img'];
  if (align) classes.push('dp-img-align-' + align);
  if (a.border === true) classes.push('dp-img-border');
  const img: Attrs = { class: classes.join(' '), src: rewriteLink(a.src || ''), alt: a.alt || '' };
  if (a.title) img.title = a.title;
  if (width && WIDTH_RE.test(width)) img.width = width;
  img.loading = 'lazy';
  const caption = (a.caption || '').trim();
  const label = caption && a.alt ? a.alt : 'Expand image';
  const lightbox: Spec = [
    'span',
    { class: 'dp-img-lightbox', role: 'button', tabindex: '0', 'aria-label': label },
    ['span', { class: 'dp-img-lightbox-inner' }, ['img', img]],
  ];
  if (!caption && !a.framed) return lightbox;
  const fig = ['dp-figure'];
  if (a.framed) fig.push('dp-figure-framed', 'dp-figure-align-' + (align ?? 'center'));
  const parts: unknown[] = ['figure', { class: fig.join(' ') }, lightbox];
  if (caption) {
    parts.push(['figcaption', {}, ['p', {}, ['dp-rawc', { 'data-raw': encodeURIComponent(captionHtml ?? caption) }]]]);
  }
  return parts as Spec;
}

/** Renders a caption's inline Markdown; installed by ../html/export.ts (keeps markdown-it out of this module). */
let captionRenderer: (caption: string) => string = (caption) => caption;
export function setCaptionRenderer(fn: (caption: string) => string): void {
  captionRenderer = fn;
}

function imageAttrsOf(attrs: Attrs): ImageAttrs {
  return attrs as unknown as ImageAttrs;
}

/** A block image: the `<Image />` component or a paragraph holding only a Markdown image. */
const DpImage = Node.create({
  name: 'dpImage',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      src: plain(''),
      alt: plain(''),
      title: plain(''),
      align: plain(null),
      width: plain(null),
      caption: plain(''),
      border: plain(null),
      framed: plain(false),
      form: plain('component'),
      altSrc: plain(null),
      jsxAttrs: plain(null),
    };
  },
  renderHTML({ node }) {
    const a = imageAttrsOf(node.attrs);
    const caption = (a.caption || '').trim();
    return ['div', { class: 'dp-image' }, imageSpec(a, caption ? captionRenderer(caption) : null)];
  },
});

/** A paragraph holding several Markdown images: one block image each, as the server renders it. */
const ImageGroup = Node.create({
  name: 'imageGroup',
  group: 'block',
  content: 'dpImage+',
  renderHTML: () => ['dp-unwrap', { class: 'dp-editor-image-group' }, 0],
});

/** An image inside text: the same lightbox, inline. */
const InlineImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { src: plain(''), alt: plain(''), title: plain(''), altSrc: plain(null) };
  },
  renderHTML({ node }) {
    const a = node.attrs as Attrs;
    return imageSpec(
      {
        src: String(a.src ?? ''),
        alt: String(a.alt ?? ''),
        title: String(a.title ?? ''),
        align: null,
        width: null,
        caption: '',
        border: null,
        framed: false,
      },
      null
    );
  },
});

/** Pipe tables and `<Table>`; cells hold blocks. `align` is the component's array, cells carry their own. */
const DpTable = Node.create({
  name: 'dpTable',
  group: 'block',
  content: 'dpTableHead? dpTableBody?',
  isolating: true,
  addAttributes() {
    return { form: plain('pipe'), align: plain([]), jsxAttrs: plain(null) };
  },
  renderHTML: () => [
    'div',
    { class: 'dp-table' },
    ['div', { class: 'dp-table-inner' }, ['table', { 'data-dp-editor-table': '' }, 0]],
  ],
});
const DpTableHead = Node.create({
  name: 'dpTableHead',
  content: 'dpTableRow+',
  renderHTML: () => ['thead', 0],
});
const DpTableBody = Node.create({
  name: 'dpTableBody',
  content: 'dpTableRow+',
  renderHTML: () => ['tbody', 0],
});
const DpTableRow = Node.create({
  name: 'dpTableRow',
  content: '(dpTableHeader | dpTableCell)+',
  renderHTML: () => ['tr', 0],
});
function cellSpec(tag: string) {
  return ({ node }: { node: { attrs: Attrs } }): Spec => {
    const align = node.attrs.align as string | null;
    const attrs: Attrs = align ? { class: 'dp-align-' + align } : {};
    return [tag, attrs, 0];
  };
}
const DpTableHeader = Node.create({
  name: 'dpTableHeader',
  content: 'block+',
  isolating: true,
  addAttributes() {
    return { align: plain(null) };
  },
  renderHTML: cellSpec('th'),
});
const DpTableCell = Node.create({
  name: 'dpTableCell',
  content: 'block+',
  isolating: true,
  addAttributes() {
    return { align: plain(null) };
  },
  renderHTML: cellSpec('td'),
});

export function embedSpec(url: string, title: string): Spec {
  const m = YOUTUBE_RE.exec(url);
  if (m) {
    return [
      'div',
      { class: 'dp-embed' },
      [
        'div',
        { class: 'dp-embed-media' },
        [
          'iframe',
          {
            class: 'dp-embed-iframe',
            src: 'https://www.youtube-nocookie.com/embed/' + m[1],
            width: '854',
            height: '480',
            title: title || 'YouTube embed',
            allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
            allowfullscreen: '',
            loading: 'lazy',
          },
        ],
      ],
    ];
  }
  return ['div', { class: 'dp-embed dp-embed-link' }, ['a', { href: url }, title || url]];
}

/** `<Embed url title … />`. Other attributes (ReadMe's `html`, `provider`, …) are kept but never rendered. */
const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: plain(''), title: plain(''), jsxAttrs: plain(null) };
  },
  renderHTML: ({ node }) => embedSpec(String(node.attrs.url ?? ''), String(node.attrs.title ?? '')),
});

export const HTMLBLOCK_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';

/** `<HTMLBlock>{`…`}</HTMLBlock>`: shown in a sandboxed frame, never inline (PLAN §2.6). */
const DpHtmlBlock = Node.create({
  name: 'dpHtmlBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { html: plain('') };
  },
  renderHTML: () => [
    'div',
    { class: 'dp-htmlblock' },
    [
      'iframe',
      {
        class: 'dp-htmlblock-frame',
        sandbox: HTMLBLOCK_SANDBOX,
        'data-dp-editor-htmlblock': '',
        loading: 'lazy',
      },
    ],
  ],
});

/** A raw HTML block, kept verbatim; the server sanitizes it on render, and so does the export. */
const RawHtml = Node.create({
  name: 'rawHtml',
  group: 'block',
  atom: true,
  addAttributes() {
    return { html: plain('') };
  },
  renderHTML: ({ node }) => rawPlaceholder(String(node.attrs.html ?? '')),
});

/** Anything the parser does not model (and front matter): shown as source, written back verbatim. */
const RawMarkdown = Node.create({
  name: 'rawMarkdown',
  group: 'block',
  atom: true,
  addAttributes() {
    return { markdown: plain(''), kind: plain('unknown') };
  },
  renderHTML: ({ node }) => [
    'div',
    { class: 'dp-editor-raw', 'data-dp-editor-drop': node.attrs.kind === 'frontmatter' ? '' : null },
    ['pre', {}, String(node.attrs.markdown ?? '')],
  ],
});

// --- inline nodes -------------------------------------------------------------------------------------------------

/** Line breaks. `soft` (a newline), `backslash`, `spaces`: rendered `<br>` + newline; `html`: a raw `<br>`. */
const HardBreak = Node.create({
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  addAttributes() {
    return { kind: plain('backslash'), raw: plain(null) };
  },
  parseHTML: () => [{ tag: 'br' }],
  renderHTML: ({ node }) => (node.attrs.kind === 'html' ? ['br'] : ['br', { 'data-dp-nl': '' }]),
  addKeyboardShortcuts() {
    return {
      'Shift-Enter': () => this.editor.commands.insertContent({ type: 'hardBreak', attrs: { kind: 'backslash' } }),
    };
  },
});

/** `:name:` for a known shortcode: shows the emoji, writes the shortcode back. */
const Emoji = Node.create({
  name: 'emoji',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { name: plain(''), char: plain('') };
  },
  renderHTML: ({ node }) => ['dp-unwrap', {}, String(node.attrs.char ?? '')],
});

/** An entity (`&mdash;`) or backslash escape (`\*`): shows its character, writes its source back. */
const Literal = Node.create({
  name: 'literal',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { text: plain(''), source: plain('') };
  },
  renderHTML: ({ node }) => ['dp-unwrap', {}, String(node.attrs.text ?? '')],
});

/** One inline raw HTML tag (`<span>`, `</b>`, …), kept verbatim. */
const HtmlInline = Node.create({
  name: 'htmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { html: plain('') };
  },
  renderHTML: ({ node }) => rawPlaceholder(String(node.attrs.html ?? '')),
});

// --- marks --------------------------------------------------------------------------------------------------------

/**
 * Every mark carries `span`, the id of the source span it came from (so `*a* [*b*](u)` stays three spans and is
 * written back as such), and `depth`, its nesting depth in the source (0 is outermost). Marks made in the editor
 * have neither. Both are only for the round trip and `exportHtml`; the canvas ignores them.
 */
const spanAttrs = { span: plain(null), depth: plain(null) };

const Bold = Mark.create({
  name: 'bold',
  addAttributes() {
    return { markup: plain('**'), ...spanAttrs };
  },
  parseHTML: () => [{ tag: 'strong' }, { tag: 'b' }],
  renderHTML: () => ['strong', 0],
  addKeyboardShortcuts() {
    return { 'Mod-b': () => this.editor.commands.toggleMark('bold') };
  },
});

const Italic = Mark.create({
  name: 'italic',
  addAttributes() {
    return { markup: plain('*'), ...spanAttrs };
  },
  parseHTML: () => [{ tag: 'em' }, { tag: 'i' }],
  renderHTML: () => ['em', 0],
  addKeyboardShortcuts() {
    return { 'Mod-i': () => this.editor.commands.toggleMark('italic') };
  },
});

const Strike = Mark.create({
  name: 'strike',
  addAttributes() {
    return { ...spanAttrs };
  },
  parseHTML: () => [{ tag: 's' }, { tag: 'del' }],
  renderHTML: () => ['s', 0],
});

/** Links: `kind` is `inline` (`[t](u)`), `autolink` (`<u>`) or `linkify` (a bare URL). */
const Link = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return { href: plain(''), title: plain(''), kind: plain('inline'), ...spanAttrs };
  },
  parseHTML: () => [{ tag: 'a[href]', getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute('href') ?? '' }) }],
  renderHTML({ mark }) {
    const attrs: Attrs = { href: rewriteLink(String(mark.attrs.href ?? '')) };
    if (mark.attrs.title) attrs.title = mark.attrs.title;
    return ['a', attrs, 0];
  },
});

/** Inline code; listed last so it is the innermost mark (its text is never escaped). */
const Code = Mark.create({
  name: 'code',
  addAttributes() {
    return { markup: plain('`'), ...spanAttrs };
  },
  parseHTML: () => [{ tag: 'code' }],
  renderHTML: () => ['code', { class: 'dp-code' }, 0],
  addKeyboardShortcuts() {
    return { 'Mod-e': () => this.editor.commands.toggleMark('code') };
  },
});

/** The schema's extensions, in schema order. Node views and editing behaviour are added by ../Canvas. */
export function schemaExtensions(): Extensions {
  return [
    Doc,
    Paragraph,
    Text,
    Heading,
    Blockquote,
    Callout,
    BulletList,
    OrderedList,
    ListItem,
    CodeBlock,
    HorizontalRule,
    DpImage,
    ImageGroup,
    InlineImage,
    DpTable,
    DpTableHead,
    DpTableBody,
    DpTableRow,
    DpTableHeader,
    DpTableCell,
    Embed,
    DpHtmlBlock,
    RawHtml,
    RawMarkdown,
    HardBreak,
    Emoji,
    Literal,
    HtmlInline,
    Bold,
    Italic,
    Strike,
    Link,
    Code,
    SourceAttributes,
  ];
}

export type { JsxAttr };
export { mergeAttributes };
