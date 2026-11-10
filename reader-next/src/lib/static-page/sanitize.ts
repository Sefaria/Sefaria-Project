/**
 * Sanitiser for a static page's content block (Django's `{% block content %}` of templates/static/*, LAUNCH_PLAN T-F31). The content
 * is the site's own templates, so the allowlist is wide — everything the templates use (sections, headings, tables, images, video and
 * audio, embedded documents and videos) with their classes, ids and inline styles, which static.css and the pages' own CSS select on —
 * but nothing that runs: scripts, inline event handlers, `javascript:` and `data:` addresses, and frames from anywhere but the few
 * document and video hosts the pages embed. Works the same on the server and in the browser (htmlparser2, no DOM).
 *
 * Also done here, because Django's content block leaves it to a script this client does not run:
 *  - the About sidebar's selected item (templates/_sidebar.html's script): the sidebar gets the page's name as its class and the
 *    page's own entry the class "selected", as on a desktop;
 *  - `<link rel="stylesheet">` inside the content (mobile-about-menu) is lifted out into the page's stylesheets;
 *  - the site's own static files (`/static/…`: images, video, PDFs) are addressed on `siteOrigin` (PUBLIC_SITE_ORIGIN: "" in the
 *    cluster, where /static is Django's; the live site in development).
 *
 * @feature STA-001 Static content pages
 */
import { Parser } from "htmlparser2";
import { escapeAttribute as escapeAttributeLoose, escapeText } from "entities";

const escapeAttribute = (v: string) => escapeAttributeLoose(v).replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ALLOWED = new Set([
  "a", "abbr", "address", "article", "aside", "audio", "b", "bdi", "bdo", "blockquote", "br", "caption", "cite", "code", "col",
  "colgroup", "dd", "del", "details", "div", "dl", "dt", "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "i", "iframe", "img", "ins", "kbd", "label", "li", "main", "mark", "nav", "ol", "p", "picture", "pre", "q", "s",
  "section", "small", "source", "span", "strong", "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot", "th", "thead",
  "time", "tr", "track", "u", "ul", "video",
]);
const VOID = new Set(["br", "col", "hr", "img", "source", "track", "wbr", "input", "link", "meta", "base", "area", "embed", "param"]);
/** Dropped with everything inside them. */
const DROP_CONTENT = new Set(["script", "style", "noscript", "template", "object", "embed", "svg", "math", "head", "title", "select", "button", "form"]);

const GLOBAL_ATTRS = new Set(["class", "id", "title", "role", "dir", "lang", "style", "hidden", "tabindex", "translate"]);
const TAG_ATTRS: Record<string, readonly string[]> = {
  a: ["href", "target", "rel", "download"],
  img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
  iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "referrerpolicy", "loading", "scrolling"],
  video: ["src", "poster", "controls", "autoplay", "loop", "muted", "preload", "playsinline", "width", "height"],
  audio: ["src", "controls", "preload", "loop", "muted"],
  source: ["src", "srcset", "type", "media", "sizes"],
  track: ["src", "kind", "srclang", "label", "default"],
  td: ["colspan", "rowspan", "align", "valign", "width", "height"],
  th: ["colspan", "rowspan", "align", "valign", "width", "height", "scope"],
  table: ["border", "cellpadding", "cellspacing", "width", "align"],
  col: ["span", "width"],
  colgroup: ["span", "width"],
  ol: ["start", "type", "reversed"],
  li: ["value"],
  time: ["datetime"],
  textarea: ["rows", "cols", "readonly"],
  details: ["open"],
  label: ["for"],
  q: ["cite"],
  blockquote: ["cite"],
};
const URL_ATTRS = new Set(["href", "src", "poster", "cite"]);

/** The hosts whose documents and videos the pages embed (terms and privacy: Google Docs; the story, AI, strategy: YouTube). */
const FRAME_HOSTS = new Set(["docs.google.com", "drive.google.com", "www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "indd.adobe.com", "issuu.com", "e.issuu.com"]);

/** An inline style that can do anything but style: old IE expressions, script or data addresses, imports, bindings. */
const UNSAFE_STYLE = /expression\s*\(|javascript:|vbscript:|url\s*\(\s*['"]?\s*(?:data|javascript|vbscript):|@import|behavior\s*:|-moz-binding|<\//i;

/**
 * The Linker page's bookmarklet ("drag this to your bookmarks bar"): a `javascript:` address that only loads the site's own linker.js.
 * Kept on the Linker page, as the page exists to hand it out; every other `javascript:` address is dropped.
 */
const LINKER_BOOKMARKLET = /^javascript:\s*\(function\s*\(\)\s*\{[^<>"]*?'https:\/\/www\.sefaria\.org\/linker\.js'[^<>"]*\}\(\)\);?$/;

export interface StaticSanitizeOptions {
  /** The page's name ("terms"): the About sidebar's selected item, and the Linker page's bookmarklet. */
  page: string;
  /** Where the site's /static/ files are (PUBLIC_SITE_ORIGIN; "" = this origin). */
  siteOrigin?: string;
}

export interface SanitizedStaticContent {
  html: string;
  /** Stylesheets linked from inside the content (`<link rel="stylesheet">`), as written (`/static/css/about.css`). */
  stylesheets: string[];
}

/** A /static/ path on the site's origin; anything else as it is. */
export function staticAsset(url: string, siteOrigin = ""): string {
  return siteOrigin && /^\/static\//.test(url) ? `${siteOrigin.replace(/\/$/, "")}${url}` : url;
}

function safeUrl(raw: string, attr: string, tag: string, opts: StaticSanitizeOptions): string | undefined {
  const url = raw.trim();
  if (!url) return undefined;
  if (/^javascript:/i.test(url)) return tag === "a" && attr === "href" && opts.page === "linker" && LINKER_BOOKMARKLET.test(url.replace(/\s+/g, " ")) ? url : undefined;
  if (url.startsWith("//")) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?|mailto|tel):/i.test(url)) return undefined;
  if (tag === "iframe") {
    let host: string;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return undefined;
      host = u.hostname.toLowerCase();
    } catch {
      return undefined;
    }
    return FRAME_HOSTS.has(host) ? url : undefined;
  }
  return staticAsset(url, opts.siteOrigin);
}

function safeSrcset(raw: string, opts: StaticSanitizeOptions): string | undefined {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const [url, ...rest] = p.split(/\s+/);
    const safe = url ? safeUrl(url, "src", "img", opts) : undefined;
    if (!safe) return undefined;
    out.push([safe, ...rest].join(" "));
  }
  return out.join(", ");
}

export function sanitizeStaticHtml(html: string, opts: StaticSanitizeOptions): SanitizedStaticContent {
  let out = "";
  const stylesheets: string[] = [];
  const open: string[] = [];
  let dropDepth = 0;
  let dropTag = "";
  // the sidebar script marks the page's item only when there is one (mobile-about-menu has none: its script throws on the old site)
  const pageId = opts.page;
  const hasSidebar = /\bid=["']aboutSidebar["']/.test(html);
  const hasPageItem = hasSidebar && new RegExp(`\\bid=["']${pageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(html);
  let selectedDone = false;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (dropDepth > 0) {
          if (name === dropTag && !VOID.has(name)) dropDepth++;
          return;
        }
        if (name === "link") {
          if (/(^|\s)stylesheet(\s|$)/i.test(attribs.rel ?? "") && attribs.href) {
            // as written (a path): the caller addresses it with the page's other stylesheets
            const href = safeUrl(attribs.href, "href", "link", { ...opts, siteOrigin: "" });
            if (href && (href.startsWith("/") || /^https?:/i.test(href))) stylesheets.push(href);
          }
          return;
        }
        if (DROP_CONTENT.has(name) || (name === "iframe" && !safeUrl(attribs.src ?? "", "src", "iframe", opts))) {
          if (!VOID.has(name)) {
            dropDepth = 1;
            dropTag = name;
          }
          return;
        }
        if (!ALLOWED.has(name)) return;
        const attrs: [string, string][] = [];
        const allowed = TAG_ATTRS[name] ?? [];
        for (const [rawKey, value] of Object.entries(attribs)) {
          const key = rawKey.toLowerCase();
          if (key.startsWith("on") || !/^[a-z][a-z0-9_.:-]*$/.test(key)) continue;
          if (!(GLOBAL_ATTRS.has(key) || allowed.includes(key) || /^aria-[a-z-]+$/.test(key) || /^data-[a-z0-9-]+$/.test(key))) continue;
          let v: string | undefined = value;
          if (URL_ATTRS.has(key)) v = safeUrl(value, key, name, opts);
          else if (key === "srcset") v = safeSrcset(value, opts);
          else if (key === "style") v = UNSAFE_STYLE.test(value) ? undefined : value;
          else if (key === "target") v = /^_(blank|self|parent|top)$/.test(value) ? value : undefined;
          if (v === undefined) continue;
          attrs.push([key, v]);
        }
        // the About sidebar, as its script leaves it on a desktop: the sidebar's class is the page, the page's item is "selected"
        if (hasPageItem && name === "nav" && attribs.id === "aboutSidebar") setAttr(attrs, "class", pageId);
        if (hasPageItem && !selectedDone && attribs.id === pageId) {
          setAttr(attrs, "class", "selected");
          selectedDone = true;
        }
        // a link that opens another window gets no hold on this one
        if (name === "a" && attrs.some(([k, v]) => k === "target" && v === "_blank")) {
          const rel = new Set((attrs.find(([k]) => k === "rel")?.[1] ?? "").split(/\s+/).filter(Boolean));
          rel.add("noopener");
          setAttr(attrs, "rel", [...rel].join(" "));
        }
        if (name === "textarea") setAttr(attrs, "readonly", "");
        out += `<${name}${attrs.map(([k, v]) => ` ${k}="${escapeAttribute(v)}"`).join("")}>`;
        if (!VOID.has(name)) open.push(name);
      },
      ontext(text) {
        if (dropDepth === 0) out += escapeText(text);
      },
      onclosetag(name, implied) {
        if (dropDepth > 0) {
          if (name === dropTag && !VOID.has(name)) dropDepth--;
          return;
        }
        if (VOID.has(name) || !ALLOWED.has(name)) return;
        const at = open.lastIndexOf(name);
        if (at < 0) return;
        // close what was left open inside it (the templates are not always balanced: design-system's `<small …></p>`)
        while (open.length > at) out += `</${open.pop()}>`;
        void implied;
      },
    },
    { decodeEntities: true, recognizeSelfClosing: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  while (open.length) out += `</${open.pop()}>`;
  return { html: out, stylesheets };
}

function setAttr(attrs: [string, string][], key: string, value: string) {
  const i = attrs.findIndex(([k]) => k === key);
  if (i >= 0) attrs[i] = [key, value];
  else attrs.push([key, value]);
}
