import { useQuery, type QueryClient } from "@tanstack/react-query";
import { notFound, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { shouldDisplayInModule, sortTopicsCompare, topicCard, type AzLang } from "~/lib/topics/topic-model";
import { topicTocPageQueryOptions } from "~/lib/topics/toc-source";
import { trendingTopicsQueryOptions } from "~/lib/topics/topics-api";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { PromoSlot, SidebarFooter } from "~/ui/NavSidebar/NavSidebar";
import { AboutTopics, SponsorADay, StudyCompanion, TrendingTopics } from "~/ui/NavSidebar/TopicModules";
import { TopicCard, TopicCardGrid } from "~/ui/TopicsNav/TopicCard";
import { TopicCategoryPage } from "~/ui/TopicsNav/TopicsPages";
import { topicPageHref } from "~/ui/NavSidebar/TopicModules";

/**
 * The category's TOC page and the trending list. A slug that is not a category goes on to its topic page, which decides whether
 * the topic exists (the old client crashed on `/topics/category/<a topic>`, a blank page; Django's own 404 is not this client's).
 */
export async function loadTopicCategory(queryClient: QueryClient, slug: string, lang: AzLang) {
  const [page] = await Promise.all([queryClient.ensureQueryData(topicTocPageQueryOptions(slug)), queryClient.ensureQueryData(trendingTopicsQueryOptions(lang)).catch(() => undefined)]);
  if (!page) throw redirect({ href: `/topics/${encodeURIComponent(slug)}`, replace: true });
  if (!page.title) throw notFound();
  return { title: page.title };
}

/**
 * `/topics/category/<slug>`: a topic category's subtopics as cards (the old TopicCategory).
 *
 * @feature TOP-013 Topic category page
 * @feature TOP-012 Topic card
 */
export function TopicCategoryRoute({ slug }: { slug: string }) {
  const lang = langCode(useInterfaceLang());
  const page = useQuery(topicTocPageQueryOptions(slug)).data;
  const trending = useQuery(trendingTopicsQueryOptions(lang)).data;
  const cards = useMemo(() => {
    if (!page) return [];
    const topLevel = new Set(page.topLevel);
    return page.entries
      .filter((e) => shouldDisplayInModule(e))
      .sort(sortTopicsCompare(lang, topLevel))
      .map((e) => topicCard(e))
      .filter((c) => c !== null);
  }, [page, lang]);
  if (!page?.title) return <LoadingState />;
  return (
    <TopicCategoryPage
      title={page.title}
      panelCategory={page.path.join("|") || "Topic Landing"}
      cards={
        <TopicCardGrid>
          {cards.map((c) => (
            <TopicCard key={c.slug} href={c.isCategory ? c.href : topicPageHref(c.slug)} routed title={c.title} description={c.description} analyticsEvent="navto_topic:click" />
          ))}
        </TopicCardGrid>
      }
      sidebar={
        <>
          <AboutTopics />
          {slug === "torah-portions" && lang === "en" ? <StudyCompanion /> : null}
          <PromoSlot />
          <TrendingTopics topics={trending} />
          <SponsorADay />
        </>
      }
      footer={<SidebarFooter />}
    />
  );
}
