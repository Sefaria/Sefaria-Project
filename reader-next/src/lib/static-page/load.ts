/**
 * Loading a static page's model on the server (for the server's render and, through a server function, for a navigation inside the
 * app), from Django through the internal API origin (Varnish keeps the public answer). Kept a few minutes per page and language in
 * this process: the pages change with a deploy, not per request.
 *
 * @feature STA-001 Static content pages
 */
import { createServerFn } from "@tanstack/react-start";
import { API_ORIGIN, SITE_ORIGIN } from "~/lib/config";
import { refuse, oneOf, record } from "~/lib/server-fn/input";
import { fetchStaticPage, type StaticPageResult } from "./content";
import { STATIC_PAGES } from "./pages";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; result: Promise<StaticPageResult> }>();

/** The page's model, shared by the requests of the next few minutes (a failure is not kept). */
export function cachedStaticPage(page: string, lang: "en" | "he", load: () => Promise<StaticPageResult>, now = Date.now()): Promise<StaticPageResult> {
  const key = `${page}|${lang}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.result;
  const result = load();
  const entry = { at: now, result };
  cache.set(key, entry);
  result.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return result;
}
/** Tests only. */
export const clearStaticPageCache = () => cache.clear();

/** loadStaticPage's input: only the pages of the list (the server never asks Django for an address a visitor made up), "en" or "he". */
export function validateStaticPageInput(d: unknown): { page: string; lang: "en" | "he" } {
  const o = record(d, "static page");
  if (typeof o.page !== "string" || !Object.hasOwn(STATIC_PAGES, o.page)) throw refuse("page: not a static page");
  return { page: o.page, lang: oneOf(o.lang, ["en", "he"] as const, "lang") };
}

export const loadStaticPage = createServerFn({ method: "GET" })
  .validator(validateStaticPageInput)
  .handler(({ data }): Promise<StaticPageResult> => cachedStaticPage(data.page, data.lang, () => fetchStaticPage(data.page, data.lang, API_ORIGIN, SITE_ORIGIN)));
