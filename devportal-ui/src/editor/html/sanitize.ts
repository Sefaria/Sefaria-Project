// The C4 sanitizer allow-list (devportal/markdown/sanitize.py, nh3/ammonia), applied to a DOM tree. The canvas
// shows raw HTML through it, and `exportHtml` uses it so the editor's HTML equals the server's. It is not a
// security boundary: the server never stores or serves HTML from a client (PLAN §2.12 "Editor content").

const RENDERER_TAGS = [
  'a', 'blockquote', 'br', 'button', 'code', 'del', 'div', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'iframe', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'table', 'tbody', 'td', 'th',
  'thead', 'tr', 'ul',
]; // prettier-ignore
const RAW_TAGS = ['b', 'i', 'u', 'small', 'sub', 'sup', 'kbd', 'mark', 'ins', 'dl', 'dt', 'dd', 'abbr', 'cite', 'q'];
export const ALLOWED_TAGS = new Set([...RENDERER_TAGS, ...RAW_TAGS]);
export const CLEAN_CONTENT_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'textarea', 'title', 'xmp', 'object', 'embed', 'form', 'select',
  'noembed', 'noframes', 'plaintext', 'math', 'svg',
]); // prettier-ignore

const ALLOWED_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  '*': new Set(['class', 'dir']),
  a: new Set(['href', 'title', 'aria-label']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  span: new Set(['role', 'tabindex', 'aria-label', 'aria-hidden']),
  ol: new Set(['start']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan']),
  code: new Set(['data-lang']),
  button: new Set(['type', 'value']),
  iframe: new Set(['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'loading']),
  h1: new Set(['id']),
  h2: new Set(['id']),
  h3: new Set(['id']),
  h4: new Set(['id']),
  h5: new Set(['id']),
  h6: new Set(['id']),
};
const GLOBAL_ATTRIBUTES = new Set(['class', 'dir']);
const URL_ATTRIBUTES = new Set(['href', 'src']);
const URL_SCHEMES = new Set(['http', 'https', 'mailto']);
export const HTMLBLOCK_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';
const IFRAME_PREFIXES = ['https://sefaria.formstack.com/', 'https://www.youtube-nocookie.com/'];
const HTMLBLOCK_SRC = /^\/_portal\/htmlblock\/[A-Za-z0-9_-]+\/\d+$/;
const CLASS_TOKEN = /^dp-[A-Za-z0-9_-]+$/;
const DIMENSION = /^\d+(\.\d+)?(px|%)?$/;
const IFRAME_ALLOW = new Set(['autoplay', 'fullscreen', 'encrypted-media', 'picture-in-picture', 'clipboard-write']);
// eslint-disable-next-line no-control-regex -- the URL parser strips C0 controls and spaces before the scheme
const SCHEME = /^[\u0000- ]*([a-zA-Z][a-zA-Z0-9+.-]*):/;

function urlAllowed(value: string): boolean {
  const m = SCHEME.exec(value);
  if (!m) return true; // relative
  return URL_SCHEMES.has((m[1] ?? '').toLowerCase());
}

/** sanitize.py _attribute_filter: the new value, or null to drop the attribute. */
function filterAttribute(tag: string, name: string, value: string): string | null {
  switch (name) {
    case 'class': {
      const tokens = value.split(/\s+/).filter((t) => CLASS_TOKEN.test(t));
      return tokens.length ? tokens.join(' ') : null;
    }
    case 'dir':
      return ['auto', 'ltr', 'rtl'].includes(value) ? value : null;
    case 'tabindex':
      return value === '0' || value === '-1' ? value : null;
    case 'role':
      return value === 'button' ? value : null;
    case 'aria-hidden':
      return value === 'true' || value === 'false' ? value : null;
    case 'loading':
      return value === 'lazy' || value === 'eager' ? value : null;
    case 'type':
      return 'button';
    case 'width':
    case 'height':
      return DIMENSION.test(value.trim()) ? value : null;
    case 'start':
    case 'colspan':
    case 'rowspan':
      return /^\d+$/.test(value) ? value : null;
  }
  if (tag === 'iframe' && name === 'src') {
    return IFRAME_PREFIXES.some((p) => value.startsWith(p)) || HTMLBLOCK_SRC.test(value) ? value : null;
  }
  if (tag === 'iframe' && name === 'allow') {
    const tokens = value
      .split(';')
      .map((t) => t.trim())
      .filter((t) => IFRAME_ALLOW.has(t));
    return tokens.length ? tokens.join('; ') : null;
  }
  if (tag === 'iframe' && name === 'allowfullscreen') return '';
  return value;
}

function sanitizeElement(el: Element): void {
  const tag = el.localName;
  const allowed = ALLOWED_ATTRIBUTES[tag];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    if (!GLOBAL_ATTRIBUTES.has(name) && !allowed?.has(name)) {
      el.removeAttribute(name);
      continue;
    }
    if (URL_ATTRIBUTES.has(name) && !urlAllowed(attr.value)) {
      el.removeAttribute(name);
      continue;
    }
    const value = filterAttribute(tag, name, attr.value);
    if (value === null) el.removeAttribute(name);
    else if (value !== attr.value) el.setAttribute(name, value);
  }
}

function walk(parent: ParentNode): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 8 /* comment */ || child.nodeType === 7 /* processing instruction */) {
      child.remove();
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    const tag = el.localName;
    // Content of <template> lives in a fragment; it is removed with its element like other clean-content tags.
    if (CLEAN_CONTENT_TAGS.has(tag) || el.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      el.remove();
      continue;
    }
    walk(el);
    if (!ALLOWED_TAGS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    sanitizeElement(el);
    if (tag === 'iframe') {
      const src = el.getAttribute('src');
      if (!src) {
        el.remove();
        continue;
      }
      if (HTMLBLOCK_SRC.test(src)) el.setAttribute('sandbox', HTMLBLOCK_SANDBOX);
    }
  }
}

/** Sanitize the children of `root` in place. */
export function sanitizeTree(root: ParentNode): void {
  walk(root);
}

/** Sanitize an HTML fragment string with the given document. */
export function sanitizeHtml(html: string, doc: Document = document): string {
  const container = doc.createElement('div');
  container.innerHTML = html;
  sanitizeTree(container);
  return container.innerHTML;
}
