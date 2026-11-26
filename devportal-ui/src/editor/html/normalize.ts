// HTML normalization for golden comparisons: the TypeScript side of devportal/contracts/NORMALIZE.md (the Python
// side is devportal/contracts/normalize.py; both pass devportal/contracts/normalize_cases.json).

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'button', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
  'html', 'iframe', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
]); // prettier-ignore
const PRESERVE = new Set(['pre', 'textarea']);
const EDITOR_ATTRIBUTES = new Set(['contenteditable', 'draggable', 'spellcheck', 'translate']);
const EDITOR_ATTRIBUTE_PREFIXES = ['data-pm-', 'data-node-view-', 'data-dp-editor-', 'data-dp-src'];
const EDITOR_CLASS_PREFIXES = ['ProseMirror', 'dp-editor-'];
const WS_ONLY = /^[ \t\n\f\r]*$/;

interface El {
  tag: string;
  attrs: [string, string][];
  children: Child[];
  parent: El | null;
}
type Child = El | string;

let decoder: HTMLTextAreaElement | null = null;
function decode(text: string): string {
  if (!text.includes('&')) return text;
  decoder ??= document.createElement('textarea');
  decoder.innerHTML = text.replace(/</g, '&lt;');
  return decoder.value;
}

const TOKEN =
  /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<\?[^>]*>?|<\/([a-zA-Z][^\s/>]*)[^>]*>|<([a-zA-Z][^\s/>]*)((?:\s*[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parse(html: string): El {
  const root: El = { tag: '#root', attrs: [], children: [], parent: null };
  let cur = root;
  let last = 0;
  const text = (s: string) => {
    if (s) cur.children.push(decode(s));
  };
  for (const m of html.matchAll(TOKEN)) {
    text(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      const tag = m[1].toLowerCase();
      let node: El | null = cur;
      while (node && node !== root && node.tag !== tag) node = node.parent;
      if (node && node !== root && node.parent) cur = node.parent;
    } else if (m[2] !== undefined) {
      const tag = m[2].toLowerCase();
      const attrs: [string, string][] = [];
      for (const a of (m[3] ?? '').matchAll(ATTR)) {
        attrs.push([(a[1] ?? '').toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? '')]);
      }
      const el: El = { tag, attrs, children: [], parent: cur };
      cur.children.push(el);
      if (!VOID.has(tag) && !m[4]) cur = el;
    }
  }
  text(html.slice(last));
  return root;
}

function cleanAttrs(attrs: [string, string][]): [string, string][] {
  const out = new Map<string, string>();
  for (const [name, raw] of attrs) {
    if (EDITOR_ATTRIBUTES.has(name) || EDITOR_ATTRIBUTE_PREFIXES.some((p) => name.startsWith(p))) continue;
    let value = raw;
    if (name === 'class') {
      const tokens = [
        ...new Set(value.split(/[ \t\n\f\r]+/).filter((t) => t && !EDITOR_CLASS_PREFIXES.some((p) => t.startsWith(p)))),
      ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (!tokens.length) continue;
      value = tokens.join(' ');
    }
    if (!out.has(name)) out.set(name, value);
  }
  return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

function isBlock(child: Child | undefined): boolean {
  return child === undefined || (typeof child !== 'string' && BLOCK.has(child.tag));
}

function serialize(node: El, preserve: boolean): string {
  const children: Child[] = [];
  for (const child of node.children) {
    const prev = children[children.length - 1];
    if (typeof child === 'string' && typeof prev === 'string') children[children.length - 1] = prev + child;
    else children.push(child);
  }
  let out = '';
  children.forEach((child, i) => {
    if (typeof child === 'string') {
      let text = child.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (!preserve && WS_ONLY.test(text) && (isBlock(children[i - 1]) || isBlock(children[i + 1]))) return;
      if (preserve && i === 0 && node.tag === 'pre' && text.startsWith('\n')) text = text.slice(1);
      out += escText(text);
      return;
    }
    const attrs = cleanAttrs(child.attrs)
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join('');
    if (VOID.has(child.tag)) out += `<${child.tag}${attrs}>`;
    else out += `<${child.tag}${attrs}>${serialize(child, preserve || PRESERVE.has(child.tag))}</${child.tag}>`;
  });
  return out;
}

export function normalizeHtml(html: string): string {
  return serialize(parse(html), false);
}
