/**
 * The topics table of contents: `GET /api/topics-toc` (Sefaria-Project, added 2026-10-06 — before that it existed only inside
 * Django's pages as `topic_toc`). A tree of categories `{slug, primaryTitle:{en,he}, children?}`.
 * Where it is not deployed yet (sefaria.org today) the answer is a 404 and every lookup is simply empty.
 *
 * @feature SRC-070 Topic result card (parent-category crumb)
 */
import { queryOptions } from "@tanstack/react-query";
import { SEFARIA_API_ORIGIN, apiJson } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";

export interface TopicTocNode {
  slug: string;
  primaryTitle: { en: string; he: string };
  children?: TopicTocNode[];
  /** Topic.contents(minify) fields the TOC carries (library.get_topic_toc_json): display gating, order, cards' text. */
  shouldDisplay?: boolean;
  displayOrder?: number;
  pools?: string[];
  description?: { en?: string; he?: string };
  categoryDescription?: { en?: string; he?: string };
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
        // a backend without the endpoint is an error (not retried, not kept), not an empty list kept on disk for 30 days — which hid
        // the endpoint for a month once the backend gained it (CODE_REVIEW low list); callers read the data as optional
        return apiJson<TopicTocNode[]>(r, `Topic TOC`);
      },
    }),
    select: topicParents,
  });

/** The tree itself (the topic editor's parent menu): the same query, unselected. */
export const topicTocTreeQueryOptions = () => {
  const { select: _select, ...rest } = topicTocQueryOptions();
  return queryOptions<TopicTocNode[]>(rest as never);
};


/**
 * One page of the topics TOC (the old Sefaria.topicTocPage(slug)): the children of a category, or the top level for none, each
 * without its own children (the flag `isCategory` says it has some). Undefined for a slug that is not a category in the TOC.
 *
 * @feature TOP-013 Topic category page
 */
export interface TopicTocEntry {
  slug: string;
  primaryTitle: { en: string; he: string };
  isCategory: boolean;
  shouldDisplay: boolean;
  displayOrder: number;
  pools: string[];
  description?: { en?: string; he?: string };
  categoryDescription?: { en?: string; he?: string };
}

const entryOf = (n: TopicTocNode): TopicTocEntry => ({
  slug: n.slug,
  primaryTitle: n.primaryTitle,
  // the old TopicTOCCard reads `children` for a category: an empty list is still a category
  isCategory: Array.isArray(n.children),
  shouldDisplay: n.shouldDisplay ?? !!n.children,
  displayOrder: n.displayOrder ?? 10000,
  pools: n.pools ?? [],
  ...(n.description ? { description: n.description } : {}),
  ...(n.categoryDescription ? { categoryDescription: n.categoryDescription } : {}),
});

export function findTopicTocNode(toc: readonly TopicTocNode[], slug: string): TopicTocNode | undefined {
  for (const n of toc) {
    if (n.slug === slug) return n;
    const hit = n.children ? findTopicTocNode(n.children, slug) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

export function topicTocPage(toc: readonly TopicTocNode[], slug?: string): TopicTocEntry[] | undefined {
  if (!slug) return toc.map(entryOf);
  const node = findTopicTocNode(toc, slug);
  return node?.children ? node.children.map(entryOf) : undefined;
}

/** slug → every category above it, outermost first (the old Sefaria.topicTocCategories). Top-level categories have []. */
export function topicTocCategoryPaths(toc: readonly TopicTocNode[]): Record<string, TopicCategory[]> {
  const out: Record<string, TopicCategory[]> = {};
  const walk = (node: TopicTocNode, above: TopicCategory[]) => {
    out[node.slug] = above; // a topic under two categories: the last one walked, as the old reducer
    const here = [...above, { slug: node.slug, en: node.primaryTitle.en, he: node.primaryTitle.he }];
    for (const child of node.children ?? []) walk(child, here);
  };
  toc.forEach((n) => walk(n, []));
  return out;
}
