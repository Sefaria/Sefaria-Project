/**
 * A static page's content from Django (LAUNCH_PLAN D-5, T-B06/T-F31): `GET /<page>?format=json&lang=en|he` (reader/static_content.py)
 * answers the page's content block, title, description and stylesheets instead of the page. Always with `lang`, so the answer is
 * the same for everyone and Django marks it public (Varnish and Cloudflare can keep it).
 *
 * Fetched on the server only (src/lib/static-page/load.ts): from the browser the page's own address would reach this client's server,
 * not Django, and the server reaches Django through the internal API origin (Varnish, src/server/internal-fetch.ts).
 *
 * @feature STA-001 Static content pages
 * @feature STA-005 Static page serving and About sidebar
 */
import { STATIC_SCOPE } from "./legacy-css";
import { sanitizeStaticHtml, staticAsset } from "./sanitize";
import { scopeCss } from "./scope-css";

/** Django's answer, as reader/static_content.py documents it. */
export interface StaticContentAnswer {
  path: string;
  lang: "en" | "he";
  title: string;
  description: string;
  html: string;
  css: string[];
  inlineCss: string;
  baseCss: string[];
  bodyClass: string;
  hasScript: boolean;
}

/** What the page renders: the sanitised content and what goes in its head. */
export interface StaticPageModel {
  page: string;
  lang: "en" | "he";
  title: string;
  description: string;
  html: string;
  /** The page's own stylesheets (static.css, its head links, links in its content), on the site's origin. */
  css: string[];
  inlineCss: string;
  /** base.html's <body> classes (the interface language, the page's own). */
  bodyClass: string;
}

/** What loading a page can come to besides its model. */
export type StaticPageResult = { kind: "page"; model: StaticPageModel } | { kind: "missing" } | { kind: "unsupported" };

/** The content address of a page ("about", "he" → "/about?format=json&lang=he"). */
export const staticContentPath = (page: string, lang: "en" | "he") => `/${page}?format=json&lang=${lang}`;

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Django's answer, checked; null when it is not one (an HTML page from a Django without the content mode, or junk). */
export function parseStaticContent(body: unknown): StaticContentAnswer | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.html !== "string" || typeof b.title !== "string" || !isStringArray(b.css)) return null;
  return {
    path: typeof b.path === "string" ? b.path : "",
    lang: b.lang === "he" ? "he" : "en",
    title: b.title,
    description: typeof b.description === "string" ? b.description : "",
    html: b.html,
    css: b.css,
    inlineCss: typeof b.inlineCss === "string" ? b.inlineCss : "",
    baseCss: isStringArray(b.baseCss) ? b.baseCss : [],
    bodyClass: typeof b.bodyClass === "string" ? b.bodyClass : b.lang === "he" ? "interface-hebrew" : "interface-english",
    hasScript: b.hasScript === true,
  };
}

/** An inline stylesheet from the page's `{% block css %}`, with nothing that could close the <style> it goes in. */
export const safeInlineCss = (css: string) => css.replace(/<\/?style/gi, "").replace(/<!--|-->/g, "");

/**
 * The page's `{% block css %}`, scoped like the legacy stylesheets (legacy-css.ts): on the old page it came after them at the same
 * specificity and won; scoped, it keeps doing so (it is rendered after the head's stylesheets).
 */
export const pageInlineCss = (css: string) => (css.trim() ? scopeCss(safeInlineCss(css), STATIC_SCOPE) : "");

/** The legacy stylesheets this client serves scoped to the page (lib/static-page/legacy-css.ts) rather than as Django lists them. */
const SCOPED_HERE = /^\/static\/css\/(?:static|common|common-components?|color-palette|fonts)\.css(?:\?|$)/;

/**
 * The model for Django's answer: sanitised content; the page's stylesheets that are not in the scoped legacy stylesheet, on the site's
 * origin (no duplicates).
 */
export function staticPageModel(page: string, answer: StaticContentAnswer, siteOrigin = ""): StaticPageModel {
  const { html, stylesheets } = sanitizeStaticHtml(answer.html, { page, siteOrigin });
  const own = [...answer.css, ...stylesheets].filter((h) => h.startsWith("/") && !h.startsWith("//") && !SCOPED_HERE.test(h));
  const css = [...new Set(own.map((h) => staticAsset(h, siteOrigin)))];
  return { page, lang: answer.lang, title: answer.title, description: answer.description, html, css, inlineCss: pageInlineCss(answer.inlineCss), bodyClass: answer.bodyClass };
}

/**
 * Ask Django for a page's content. A 404 is a page Django does not have (or a standalone document): "missing". A 200 that is not the
 * content answer is a Django without the content mode (an older deploy, the live site in development): "unsupported", so the caller
 * hands the request to Django's own page. Anything else (a 5xx, a timeout) throws: the page answers 503.
 */
export async function fetchStaticPage(page: string, lang: "en" | "he", apiOrigin: string, siteOrigin: string, fetcher: typeof fetch = fetch): Promise<StaticPageResult> {
  const res = await fetcher(`${apiOrigin}${staticContentPath(page, lang)}`, { headers: { accept: "application/json" } });
  if (res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    return { kind: "missing" };
  }
  if (!res.ok) throw new Error(`static page ${page} (${lang}): ${res.status}`);
  if (!(res.headers.get("content-type") ?? "").includes("json")) {
    await res.body?.cancel().catch(() => undefined);
    return { kind: "unsupported" };
  }
  const answer = parseStaticContent(await res.json().catch(() => null));
  return answer ? { kind: "page", model: staticPageModel(page, answer, siteOrigin) } : { kind: "unsupported" };
}
