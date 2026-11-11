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
import { LEGACY_SOURCES } from "./legacy-css";
import { sanitizeStaticHtml } from "./sanitize";

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

/**
 * An inline stylesheet with nothing that could end the <style> it goes in or open markup: every `<` becomes the CSS escape `\3c `
 * (inside a string or a selector it means the same; outside one it was never valid CSS). Applied last, to the finished text.
 */
export const safeInlineCss = (css: string) => css.replace(/</g, "\\3c ");

/**
 * The page's `{% block css %}` as Django sends it is NOT used (owner, 2026-11-10): scoping CSS at request time could not be made
 * safe (a crafted block restyled the whole shell, twice past review). Each rendered page's block is instead built from the
 * repository's templates into the scoped static stylesheet (legacy-css.ts buildStaticPageCss), checked by legacy-css.test.ts.
 * Kept for the tests of the scoper and for callers that still pass Django's field: it always answers "".
 */
export const pageInlineCss = (_css: string) => "";

export { remToPx } from "./rem-to-px";

/** The legacy stylesheets this client serves scoped to the page (lib/static-page/legacy-css.ts LEGACY_SOURCES). */
const SCOPED_HERE = new Set(LEGACY_SOURCES.map((p) => `/static/${p}`));

/**
 * The model for Django's answer: sanitised content, and no unscoped stylesheet: the ones Django lists are served scoped by this client
 * (legacy-css.ts); any other a page asks for (in its head or its content) would restyle the shell, so it is left out and logged —
 * today only mobile-about-menu's /static/css/about.css, which does not exist (404 on sefaria.org too).
 */
export function staticPageModel(page: string, answer: StaticContentAnswer, siteOrigin = ""): StaticPageModel {
  const { html, stylesheets } = sanitizeStaticHtml(answer.html, { page, siteOrigin });
  const unscoped = [...answer.css, ...stylesheets].filter((h) => !SCOPED_HERE.has(h.split("?")[0]!));
  if (unscoped.length) console.warn(`[static-page] ${page}: stylesheets not loaded (not in the scoped legacy CSS): ${unscoped.join(", ")}`);
  const css: string[] = [];
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
