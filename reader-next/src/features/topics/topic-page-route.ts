import { notFound } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { readVersionPrefs } from "~/lib/versions/prefs-source";
import { normalizeTopicSlug, topicPageHead } from "~/lib/topics/topic-page";
import { loadTopicPage } from "./TopicPageRoute";

export interface TopicPageSearch {
  sort?: string;
  tab?: string;
  /** "1": the moderators' editors (Add a source, Edit, Reorder sources) are still the old page's — hand this request to Django. */
  editor?: string;
}

/**
 * The options both topic routes share (/topics/<slug> and /topics/b/<slug>): `?sort=` and `?tab=` read as the old site wrote them,
 * the slug normalised as Django looks it up, the page loaded on the server, its title and description as reader/views.py topic_page.
 */
export const topicPageRoute = (prefix: "" | "b/") => ({
  validateSearch: (s: Record<string, unknown>): TopicPageSearch => ({
    ...(typeof s.sort === "string" ? { sort: s.sort } : {}),
    ...(typeof s.tab === "string" ? { tab: s.tab } : {}),
    ...(s.editor === "1" ? { editor: "1" } : {}),
  }),
  loader: async ({ context, params, location }: { context: { queryClient: QueryClient; interfaceLang: "english" | "hebrew" }; params: { _splat?: string }; location: { search: TopicPageSearch } }) => {
    const slug = normalizeTopicSlug(params._splat ?? "");
    if (!slug) throw notFound();
    // the old page with its editors: a 404 here sends the request on to Django, which renders the same address
    if (location.search.editor === "1") throw notFound();
    const lang = context.interfaceLang === "hebrew" ? ("he" as const) : ("en" as const);
    const transLangPref = (await readVersionPrefs().catch(() => undefined))?.translationLanguage;
    const page = await loadTopicPage(context.queryClient, slug, lang, location.search.tab, transLangPref);
    const head = topicPageHead(page, lang);
    return { slug, prefix, lang, transLangPref, title: head.title, description: head.description, noindex: page.noindex };
  },
  head: ({ loaderData }: { loaderData?: { title: string; description: string; noindex: boolean } }) => ({
    meta: [
      ...(loaderData ? [{ title: loaderData.title }, { name: "description", content: loaderData.description }] : []),
      ...(loaderData?.noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
  }),
});
