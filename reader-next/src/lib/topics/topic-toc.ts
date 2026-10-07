/**
 * The topics table of contents: `GET /api/topics-toc` (Sefaria-Project, added 2026-10-06 — before that it existed only inside
 * Django's pages as `topic_toc`). A tree of categories `{slug, primaryTitle:{en,he}, children?}`.
 * Where it is not deployed yet (sefaria.org today) the answer is a 404 and every lookup is simply empty.
 *
 * @feature SRC-070 Topic result card (parent-category crumb)
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, SefariaApiError } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface TopicTocNode {
  slug: string;
  primaryTitle: { en: string; he: string };
  children?: TopicTocNode[];
}
export interface TopicCategory {
  slug: string;
  en: string;
  he: string;
}

/**
 * slug → the category directly above it (the old Sefaria.displayTopicTocCategory: the last of the node's parents). Top-level
 * categories have none.
 */
export function topicParents(toc: readonly TopicTocNode[]): Record<string, TopicCategory> {
  const out: Record<string, TopicCategory> = {};
  const walk = (node: TopicTocNode) => {
    for (const child of node.children ?? []) {
      out[child.slug] = { slug: node.slug, en: node.primaryTitle.en, he: node.primaryTitle.he };
      walk(child);
    }
  };
  toc.forEach(walk);
  return out;
}

export const topicTocQueryOptions = () =>
  queryOptions<TopicTocNode[], Error, Record<string, TopicCategory>>({
    ...withPolicy("catalog", {
      queryKey: ["catalog", "topic-toc"] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TopicTocNode[]> => {
        const r = await fetch(`${SEFARIA_API_ORIGIN}/api/topics-toc`, { signal });
        if (r.status === 404) return [];
        if (!r.ok) throw new SefariaApiError(`Topic TOC: HTTP ${r.status}`, r.status);
        return (await r.json()) as TopicTocNode[];
      },
    }),
    select: topicParents,
  });
