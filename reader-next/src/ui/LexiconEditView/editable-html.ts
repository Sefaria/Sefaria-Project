/**
 * What the dictionary editor's box is filled with (the stored entry went into innerHTML raw). The server's own
 * allowlist for an entry (sefaria/model/lexicon.py LexiconEntry.ALLOWED_TAGS / ALLOWED_ATTRS), so editing a field keeps everything the
 * server would keep on save (`big` included) and nothing that runs:
 *  - no script, style and the like (dropped with their content), no `on*` handlers, no attribute outside the server's list;
 *  - a link's href: a path (with or without a leading slash, as stored), http(s) or mailto — never javascript:, data: or `//host`;
 *  - an image only as the server keeps it (a `data:image/` src and nothing else), and only a raster one: png, jpeg, gif, webp — never
 *    SVG.
 * Legacy did not sanitise the box at all (LexiconWysiwygValue.jsx: "would rewrite untouched markup on any edit"): a deliberate difference.
 * Works the same on the server and in the browser (htmlparser2, no DOM).
 *
 * @feature CON-072 Edit a dictionary entry (moderator)
 */
import { Parser } from "htmlparser2";
import { escapeAttribute as escapeAttributeLoose, escapeText } from "entities";

const escapeAttribute = (v: string) => escapeAttributeLoose(v).replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** LexiconEntry.ALLOWED_ATTRS (img's rule is the src check below). */
const ALLOWED: Record<string, readonly string[]> = {
  i: ["data-commentator", "data-order", "class", "data-label", "dir"],
  b: [],
  br: [],
  u: [],
  strong: [],
  em: [],
  big: [],
  small: [],
  img: [],
  sup: ["class"],
  sub: [],
  span: ["class", "dir"],
  a: ["dir", "class", "href", "data-ref", "data-scroll-link"],
};
const VOID = new Set(["br", "img"]);
const DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "svg", "math", "textarea", "title"]);
/** A raster image as a data address (base64 or not); the type is checked case-insensitively, SVG is never one. */
export const RASTER_DATA_IMAGE = /^data:image\/(?:png|jpeg|jpg|gif|webp)(?:;[a-z0-9=.+-]+)*,/i;

function safeHref(raw: string): string | undefined {
  const h = raw.trim();
  // a tab or newline inside is dropped by the browser while it reads the address ("java\tscript:"): never one of ours
  // eslint-disable-next-line no-control-regex -- looks for control characters on purpose
  if (!h || /[\u0000-\u001f\u007f]/.test(h)) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(h)?.[1]?.toLowerCase();
  if (scheme) return scheme === "http" || scheme === "https" || scheme === "mailto" ? h : undefined;
  if (/^[/\\]{2}/.test(h) || h.split(/[/?#]/, 1)[0]!.includes(":")) return undefined; // protocol-relative, or a hidden scheme
  return h;
}

export function editableHtml(html: string): string {
  let out = "";
  const open: string[] = [];
  let drop = 0;
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (drop > 0 || DROP_CONTENT.has(name)) {
          drop++;
          return;
        }
        const allowed = Object.hasOwn(ALLOWED, name) ? ALLOWED[name] : undefined;
        if (!allowed) return;
        let attrs = "";
        if (name === "img") {
          const src = (attribs.src ?? "").trim();
          if (!RASTER_DATA_IMAGE.test(src)) return;
          attrs = ` src="${escapeAttribute(src)}"`;
        }
        for (const a of allowed) {
          const v = attribs[a];
          if (v === undefined) continue;
          const value = a === "href" ? safeHref(v) : v;
          if (value !== undefined) attrs += ` ${a}="${escapeAttribute(value)}"`;
        }
        out += `<${name}${attrs}>`;
        if (!VOID.has(name)) open.push(name);
      },
      ontext(text) {
        if (drop === 0) out += escapeText(text);
      },
      onclosetag(name) {
        if (drop > 0) {
          drop--;
          return;
        }
        if (VOID.has(name) || !Object.hasOwn(ALLOWED, name)) return;
        const at = open.lastIndexOf(name);
        if (at < 0) return;
        while (open.length > at) out += `</${open.pop()}>`;
      },
    },
    { decodeEntities: true, recognizeSelfClosing: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  while (open.length) out += `</${open.pop()}>`;
  return out;
}
