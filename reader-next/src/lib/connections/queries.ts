import { queryOptions } from "@tanstack/react-query";
import { related } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import type { IndexLookup, RelatedLink } from "./links";
import { filterLinks } from "./links";

/**
 * All links attached to a section, without their text (`/api/links/<section>?with_text=0&with_sheet_links=1`). One request
 * serves the whole section: the dots beside every verse, and the summary / lists for whichever verse is
 * selected. `with_sheet_links` adds sheets from collections listed in the library (they count as connections in
 * the old sidebar, which read links from `/api/related?with_sheet_links=1`): without it Genesis 1:1 shows
 * Commentary (957) where sefaria.org shows 958. The server's `/api/related` also returns sheets, topics and
 * more, but is 2–4× larger.
 *
 * @feature CON-071 Related data API and caching
 */
export async function fetchSectionLinks(sectionRef: string, signal?: AbortSignal): Promise<RelatedLink[]> {
  const result = await related.getLinks({ client: getSefariaClient(), path: { tref: sectionRef }, query: { with_text: "0", with_sheet_links: "1" } as never, signal });
  return unwrap(result, `Links for ${sectionRef}`) as unknown as RelatedLink[];
}

export const linksQueryKey = (sectionRef: string) => ["links", sectionRef] as const;

export const linksQueryOptions = (sectionRef: string) =>
  queryOptions<RelatedLink[], Error, RelatedLink[], ReturnType<typeof linksQueryKey>>({
    ...withPolicy("connections", {
      queryKey: linksQueryKey(sectionRef),
      queryFn: ({ signal }: { signal: AbortSignal }): Promise<RelatedLink[]> => fetchSectionLinks(sectionRef, signal),
    }),
  });

/**
 * Connection counts for every segment of a section under the active filter: the dot beside each verse.
 * Counts follow the sidebar's filter (Rashi selected → dots show Rashi's comments only).
 *
 * @feature CON-029 Sidebar filter mirrored to base text link dots
 */
export function linkCountsBySegment(links: readonly RelatedLink[], filter: readonly string[], lookup: IndexLookup): Record<string, number> {
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const l of filterLinks(links, filter, lookup)) {
    if (l.type === "essay") continue;
    for (const ref of l.anchorRefExpanded) {
      const key = `${ref}|${l._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[ref] = (counts[ref] ?? 0) + 1;
    }
  }
  return counts;
}
