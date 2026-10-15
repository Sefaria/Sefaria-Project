/**
 * Who or what a highlighted name in the text refers to: `GET /api/v2/topics/<slug>` the way the old sidebar asks for it
 * (not annotated: no links, refs or indexes). An ambiguous name ("Rabban Gamliel") comes back with `possibilities`.
 * VERIFIED on sefaria.org: Rabbi Eliezer b. Hyrcanus → title, "Tannaim - Third Generation", "c.80 – c.110 CE", description.
 *
 * @feature CON-045 Named entity popup in sidebar
 * @feature TXD-022 Inline named-entity (topic) links in text
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface Bilingual {
  en: string;
  he: string;
}
export interface EntityTopic {
  slug: string;
  primaryTitle: Bilingual;
  description?: Bilingual | null;
  timePeriod?: { name: Bilingual; yearRange: Bilingual } | null;
}
export interface EntityAnswer extends Partial<EntityTopic> {
  slug: string;
  possibilities?: EntityTopic[];
}

export const entityQueryOptions = (slug: string) =>
  queryOptions<EntityAnswer>({
    ...withPolicy("reference", {
      queryKey: ["entity", slug] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<EntityAnswer> => {
        const q = "annotate_time_period=1&with_html=0&with_links=0&annotate_links=0&with_refs=0&group_related=0&with_indexes=0";
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/v2/topics/${encodeURIComponent(slug)}?${q}`, { signal });
        if (!r.ok) throw new SefariaApiError(`Topic ${slug}: HTTP ${r.status}`, r.status);
        return (await r.json()) as EntityAnswer;
      },
    }),
  });

/** The entities to show: the topic itself, or each possibility of an ambiguous name. */
export const entitiesOf = (a: EntityAnswer): EntityTopic[] => (a.possibilities ?? [a as EntityTopic]).filter((e) => e.primaryTitle);

/** The attribution under the three dots (hard-coded on the old site: Jerusalem Talmud is "by Sefaria"). */
export function entitySourceNote(ref: string, localizedRef: Bilingual): Bilingual {
  const jt = ref.includes("Jerusalem Talmud");
  return {
    en: `This topic is connected to "${localizedRef.en}" ${jt ? "by Sefaria" : "based on the research of Dr. Michael Sperling"}.`,
    he: `נושא הזה קשור ל-"${localizedRef.he}" ${jt ? "על ידי ספריא" : "על סמך מחקרו של ד״ר מיכאל ספרלינג"}.`,
  };
}
