/**
 * Allowlist HTML sanitizer for content that comes from the library's database (version notes, descriptions):
 * trusted-ish, but never trusted enough to put in the page raw. Works the same on the server and in the browser
 * (htmlparser2, no DOM).
 *
 * Only a small set of text-level tags survives; every attribute is dropped except `href` on links (http, https,
 * mailto, or a path, which is made absolute against `baseUrl`) and `lang`/`dir`. The contents of script, style,
 * iframe and the like are removed with them. Links to other sites open in a new tab, without opener access.
 */
import { Parser } from "htmlparser2";
import { escapeAttribute, escapeText } from "entities";

const ALLOWED = new Set(["a", "abbr", "b", "blockquote", "br", "code", "div", "em", "h3", "h4", "h5", "h6", "i", "li", "ol", "p", "small", "span", "strong", "sub", "sup", "u", "ul"]);
const VOID = new Set(["br"]);
/** Tags whose whole content is dropped, not just the tag. */
const DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math"]);

export interface SanitizeOptions {
  /**
   * Extra attributes to keep, per tag (values are escaped, never interpreted). The default keeps none, so nothing
   * but the vetted `href`, `lang` and `dir` can reach the page.
   */
  keepAttributes?: Partial<Record<string, readonly string[]>>;
  /** Origin that relative links are resolved against ("https://www.sefaria.org"). Without it relative links are kept relative. */
  baseUrl?: string;
}

function safeHref(href: string | undefined, baseUrl: string | undefined): string | undefined {
  if (!href) return undefined;
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (h.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(h)) return undefined; // javascript:, data:, protocol-relative
  if (h.startsWith("/") || h.startsWith("#")) return baseUrl && h.startsWith("/") ? baseUrl.replace(/\/$/, "") + h : h;
  return undefined; // bare relative paths are ambiguous: drop
}

export function sanitizeHtml(html: string, opts: SanitizeOptions = {}): string {
  let out = "";
  const open: string[] = [];
  let dropDepth = 0;
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (dropDepth > 0) {
          if (!VOID.has(name)) dropDepth++;
          return;
        }
        if (DROP_CONTENT.has(name)) {
          dropDepth = 1;
          return;
        }
        if (!ALLOWED.has(name)) return;
        let attrs = "";
        if (name === "a") {
          const href = safeHref(attribs.href, opts.baseUrl);
          if (href) attrs += ` href="${escapeAttribute(href)}"`;
          if (href && /^https?:/i.test(href)) attrs += ' target="_blank" rel="noopener noreferrer"';
        }
        for (const attr of opts.keepAttributes?.[name] ?? []) {
          const v = attribs[attr];
          if (v !== undefined && /^[a-z][a-z0-9-]*$/.test(attr) && !attr.startsWith("on")) attrs += ` ${attr}="${escapeAttribute(v)}"`;
        }
        if (attribs.lang && /^[a-zA-Z-]{2,12}$/.test(attribs.lang)) attrs += ` lang="${attribs.lang}"`;
        if (attribs.dir === "rtl" || attribs.dir === "ltr") attrs += ` dir="${attribs.dir}"`;
        out += `<${name}${attrs}>`;
        if (!VOID.has(name)) open.push(name);
      },
      ontext(text) {
        if (dropDepth === 0) out += escapeText(text);
      },
      onclosetag(name) {
        if (dropDepth > 0) {
          if (!VOID.has(name)) dropDepth--;
          return;
        }
        if (open.length && open[open.length - 1] === name) {
          open.pop();
          out += `</${name}>`;
        }
      },
    },
    { decodeEntities: true, recognizeSelfClosing: true },
  );
  parser.write(html);
  parser.end();
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
