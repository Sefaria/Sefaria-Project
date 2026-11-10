/**
 * Links to the Library's pages (the logo, Texts, Topics, search, topic pages) from the header and the library's own pages. On the
 * Library host they are relative, so they navigate inside this client (T-F02). On a Voices host (voices.sefaria.org,
 * chiburim.sefaria.org.il) they keep the address they always had, `${SITE_ORIGIN}${path}` — a relative "/" or "/topics" there is a
 * Voices page (the Voices home, Django's Voices topics), and Voices is out of scope.
 *
 * The host is the one the page was asked for: the root route reads it from the request on the server and from the location in the
 * browser, and provides it here, so the server render and hydration agree.
 */
import { createContext, createElement, useCallback, useContext, type ReactNode } from "react";
import { PUBLIC_CONFIG, SITE_ORIGIN } from "~/lib/config";
import { isVoicesHost } from "./django-paths";

/** `path` ("/topics") as a link from a page on `host`. */
export function libraryHref(path: string, host: string | undefined, siteOrigin: string = SITE_ORIGIN, voicesOrigin: string = PUBLIC_CONFIG.voicesOrigin): string {
  return host && isVoicesHost(host, voicesOrigin) ? `${siteOrigin}${path}` : path;
}

const SiteHost = createContext<string | undefined>(undefined);
export function SiteHostProvider({ value, children }: { value: string | undefined; children?: ReactNode }) {
  return createElement(SiteHost.Provider, { value }, children);
}
/** The page's host (undefined outside the app, e.g. in stories: the Library host). */
export const useSiteHost = () => useContext(SiteHost);
/** libraryHref for the current page's host. */
export function useLibraryHref(): (path: string) => string {
  const host = useContext(SiteHost);
  return useCallback((path: string) => libraryHref(path, host), [host]);
}
