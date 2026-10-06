/**
 * A book's details for the About box: authors, description, composition place and date, related topics
 * (`/api/v2/index/<title>?with_content_counts=1&with_related_topics=1`, as the old client asks). Small, rarely
 * changes: cached like the catalog.
 *
 * @feature CON-039 About this text box
 */
import { queryOptions } from "@tanstack/react-query";
import { index } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface Bilingual {
  en?: string;
  he?: string;
}
export interface IndexAuthor {
  en?: string;
  he?: string;
  slug: string;
}
export interface RelatedTopic {
  slug: string;
  title: { en: string; he: string };
}

export interface IndexDetails {
  title: string;
  heTitle: string;
  categories: string[];
  authors?: IndexAuthor[];
  enDesc?: string | null;
  heDesc?: string | null;
  enShortDesc?: string | null;
  heShortDesc?: string | null;
  compPlaceString?: Bilingual;
  compDateString?: Bilingual;
  pubPlaceString?: Bilingual;
  pubDateString?: Bilingual;
  compPlace?: string;
  pubPlace?: string;
  relatedTopics?: RelatedTopic[];
}

export const indexDetailsQueryOptions = (title: string) =>
  queryOptions<IndexDetails>({
    ...withPolicy("catalog", {
      queryKey: ["catalog", "index-details", title] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<IndexDetails> => {
        const r = await index.getIndexV2({ client: getSefariaClient(), path: { title }, query: { with_content_counts: "1", with_related_topics: "1" }, signal });
        return unwrap(r, `Details of ${title}`) as unknown as IndexDetails;
      },
    }),
  });
