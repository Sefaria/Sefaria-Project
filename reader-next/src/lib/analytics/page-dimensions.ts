/**
 * The page-type custom dimension (GA `dimension5`) the old ReaderApp sets before every page view (ReaderApp.trackPageview →
 * Track.setPageType): `panels[0].menuOpen || panels[0].mode`, "Static" for a page with no React panel. The new shell did not set it
 * (LAUNCH_PLAN T-D04). Values are the old client's, mapped from the address:
 *
 *   /texts, /texts/<category>        navigation        (menuOpen "navigation")
 *   a book's own page                book toc
 *   a text                           Text              (on a phone with the sidebar open: TextAndConnections, the old single panel)
 *   /search                          search
 *   /topics… (not /topics/all)       topics
 *   /topics/all/<letter>             allTopics
 *   /calendars                       calendars
 *   /saved, /history, /texts/notes   saved, history, notes
 *   /translations/<slug>             translationsPage
 *   anything else                    Static            (Django template pages on the old site: login, register, activity…)
 *
 * Only the `ga` shim's `set` (uaSet), as the old Track did: nothing goes to gtag, so the GA4 stream is unchanged.
 *
 * @feature ANL-010 Pageview dimensions
 */
import { uaSet } from "./core";

export interface PageTypeContext {
  /** The router's match said this splat path is a book's page, not a text. */
  book?: boolean;
  /** A phone-width layout (the old client's single-panel mode). */
  phone?: boolean;
  /** The address opens the sidebar (`with=`). */
  sidebar?: boolean;
}

export function legacyPageType(pathname: string, ctx: PageTypeContext = {}): string {
  if (/^\/(?:$|texts\/?$)/.test(pathname) || (/^\/texts\//.test(pathname) && !/^\/texts\/notes(?:\/|$)/.test(pathname))) return "navigation";
  if (/^\/texts\/notes(?:\/|$)/.test(pathname)) return "notes";
  if (/^\/search(?:\/|$)/.test(pathname)) return "search";
  if (/^\/topics\/all(?:\/|$)/.test(pathname)) return "allTopics";
  if (/^\/topics(?:\/|$)/.test(pathname)) return "topics";
  if (/^\/calendars\/?$/.test(pathname)) return "calendars";
  if (/^\/saved\/?$/.test(pathname)) return "saved";
  if (/^\/history\/?$/.test(pathname)) return "history";
  if (/^\/translations\//.test(pathname)) return "translationsPage";
  if (/^\/(?:login|register|password|logout|activity|compare|interface|settings|static|sheets|collections|profile)(?:\/|$)/.test(pathname)) return "Static";
  if (ctx.book) return "book toc";
  return ctx.phone && ctx.sidebar ? "TextAndConnections" : "Text";
}

let last: string | null = null;

/** Set dimension5 for the page now on screen (once per change, as the old client re-set it on every history push). */
export function setPageTypeDimension(pageType: string): void {
  if (pageType === last) return;
  last = pageType;
  uaSet("dimension5", pageType);
}

/** Tests: forget the last value. */
export const resetPageTypeDimension = () => {
  last = null;
};
