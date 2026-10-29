/**
 * A moderator connects a topic to the selected passage from the sidebar's Topics view — the old TopicSearch
 * (static/js/TopicSearch.jsx; Sefaria.postRefTopicLink; server reader/views.py topic_ref_api):
 *  - suggestions: `GET /api/name/<word>?type=Topic` (no topic_pool: every topic), the first four, then
 *    "Create a new topic: <word>";
 *  - add: `POST /api/ref-topic-links/<ref>` json {topic: slug, interface_lang}. Staff only on the server (anyone else gets
 *    {error}); the answer is the new link, annotated like the ones /api/related returns, so it joins the list at once.
 *
 * @feature CON-047 Moderator topic search / add topic to ref
 */
import type { QueryClient } from "@tanstack/react-query";
import { postJson } from "~/lib/auth/http";
import { resourcesQueryOptions, groupByRef, type RelatedTopic, type SectionResources } from "~/lib/connections/related";
import { refToUrl } from "~/lib/ref/url";
import type { NameResponse } from "~/lib/search/autocomplete";

export interface TopicSuggestion {
  name: string;
  /** The topic's slug; "" for the "Create a new topic" row. */
  key: string;
}

export const CREATE_NEW_TOPIC = { en: "Create a new topic: ", he: "יצירת נושא: " } as const;

/** The old parseCompletions: up to four topics, then the row that offers to create one named after what was typed. */
export function topicSuggestions(d: NameResponse, word: string, createPrefix: string): TopicSuggestion[] {
  const topics = (d.completion_objects ?? []).slice(0, 4).map((c) => ({ name: c.title, key: String(c.key) }));
  return [...topics, { name: createPrefix + word.trim(), key: "" }];
}

/**
 * The old normRef(srefs) for a selection: one verse as is; several as a range from the first to the last, the last written from
 * where it parts from the first — "Genesis 1:3-5", across a chapter "Genesis 1:31-2:1", a complex text's "…, Kadesh 2-4".
 * Refs that share no book fall back to `fallback`.
 */
export function selectionRange(refs: readonly string[], fallback: string): string {
  if (refs.length <= 1) return refs[0] ?? fallback;
  const first = refs[0]!;
  const last = refs[refs.length - 1]!;
  // the common start, cut back to just after a " " or ":" so "1:3" and "1:35" part at "3", not inside it
  let i = 0;
  while (i < first.length && first[i] === last[i]) i++;
  while (i > 0 && first[i - 1] !== " " && first[i - 1] !== ":") i--;
  return i > 0 && i < last.length ? `${first}-${last.slice(i)}` : fallback;
}

/** Connect `slug` to `ref`. Resolves to the new link; throws with the server's message. */
export async function addRefTopicLink(ref: string, slug: string, interfaceLang: "english" | "hebrew"): Promise<RelatedTopic> {
  const res = await postJson(`/api/ref-topic-links/${refToUrl(ref)}`, { topic: slug, interface_lang: interfaceLang });
  const data = res.data as unknown as RelatedTopic & { error?: string };
  if (!res.ok || data.error || !data.topic) throw new Error(data.error ?? `Could not add the topic (HTTP ${res.status})`);
  return data;
}

/** The old post(): the new link is filed under each verse it covers, so the Topics list and its count show it at once. */
export function addLinkToResources(qc: QueryClient, sectionRef: string, link: RelatedTopic) {
  qc.setQueryData(resourcesQueryOptions(sectionRef).queryKey, (res: SectionResources | undefined) => {
    if (!res) return res;
    const topics = { ...res.topics };
    for (const [ref, items] of Object.entries(groupByRef([link]))) topics[ref] = [...(topics[ref] ?? []).filter((t) => t.topic !== link.topic), ...items];
    return { ...res, topics };
  });
}
