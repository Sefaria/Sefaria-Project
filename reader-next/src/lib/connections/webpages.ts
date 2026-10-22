/**
 * Web pages that cite the selected passage, from `/api/related/<segment ref>/websites`, with the old sidebar's
 * grouping and ordering (Sefaria.webPagesByRef, WebPagesList). VERIFIED on sefaria.org (Berakhot 2a:1: 516 pages
 * in 31 sites, Halachipedia (145) first, then Torat Har Etzion (120), …, Hebrew-language sites after the English).
 *
 * @feature CON-052 Web pages citing this text
 * @feature CON-053 Web page list items
 */
import { queryOptions } from "@tanstack/react-query";
import { related } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface WebPageItem {
  url: string;
  title: string;
  description?: string | null;
  /** How many times the Sefaria Linker found a citation on the page: the tie-break. */
  linkerHits: number;
  domain: string;
  siteName: string;
  favicon: string;
  /** "Last, First" */
  authors?: string[] | null;
  articleSource?: { title: string; related_parts?: string } | null;
  anchorRef: string;
  anchorRefExpanded: string[];
}

export const webPagesQueryOptions = (ref: string) =>
  queryOptions<WebPageItem[]>({
    ...withPolicy("connections", {
      queryKey: ["webpages", ref] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<WebPageItem[]> => {
        const r = await related.getRelatedWebsites({ client: getSefariaClient(), path: { tref: ref }, signal });
        const body = unwrap(r, `Web pages for ${ref}`) as unknown;
        return (Array.isArray(body) ? body : ((body as { webpages?: unknown[] })?.webpages ?? [])) as WebPageItem[];
      },
    }),
  });

export const isHebrewText = (s: string): boolean => /[֐-׿]/.test(s);

type InterfaceLang = "english" | "hebrew";

/** A negative number when `a`'s language comes first: the interface language's pages lead. */
const languageOrder = (aHe: boolean, bHe: boolean, interfaceLang: InterfaceLang): number =>
  aHe === bHe ? 0 : (bHe ? -1 : 1) * (interfaceLang === "hebrew" ? -1 : 1);

/**
 * Old webPagesByRef order: pages in the interface language first; then those anchored to fewer verses ("Genesis
 * 1:2" before "Genesis 1:2-5" before "Genesis 1"); then single verses before ranges; then by Linker hits.
 */
export function sortPages(pages: readonly WebPageItem[], interfaceLang: InterfaceLang): WebPageItem[] {
  return [...pages].sort((a, b) => {
    const lang = languageOrder(isHebrewText(a.title), isHebrewText(b.title), interfaceLang);
    if (lang) return lang;
    if (a.anchorRefExpanded.length !== b.anchorRefExpanded.length) return a.anchorRefExpanded.length - b.anchorRefExpanded.length;
    const [aRange, bRange] = [a.anchorRef.includes("-"), b.anchorRef.includes("-")];
    if (aRange !== bRange) return bRange ? -1 : 1;
    return b.linkerHits - a.linkerHits;
  });
}

/** The pages of several refs as one list: a page cited at more than one of them appears once. */
export function mergePages(lists: readonly (readonly WebPageItem[] | undefined)[]): WebPageItem[] {
  const seen = new Set<string>();
  const out: WebPageItem[] = [];
  for (const list of lists) {
    for (const p of list ?? []) {
      const key = `${p.url}\u0000${p.anchorRef}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out;
}

export interface Site {
  name: string;
  favicon: string;
  count: number;
}

/** Old WebPagesList: pages grouped by site; sites in the interface language first, then by number of pages. */
export function sitesOf(pages: readonly WebPageItem[], interfaceLang: InterfaceLang): Site[] {
  const sites = new Map<string, Site>();
  for (const p of pages) {
    const s = sites.get(p.siteName);
    if (s) s.count++;
    else sites.set(p.siteName, { name: p.siteName, favicon: p.favicon, count: 1 });
  }
  return [...sites.values()].sort((a, b) => languageOrder(isHebrewText(a.name), isHebrewText(b.name), interfaceLang) || b.count - a.count);
}

/** "First Last" names, joined "A, B and C" (Hebrew: "A, B וC"). The API gives "Last, First". */
export function authorsString(authors: readonly string[] | null | undefined, hebrew: boolean): string {
  if (!authors?.length) return "";
  const names = authors.map((a) => a.split(", ").reverse().join(" "));
  const last = hebrew ? " ו" : " and ";
  return names.reduce((acc, name, i) => `${acc}${i === 0 ? "" : i === names.length - 1 ? last : ", "}${name}`, "");
}
