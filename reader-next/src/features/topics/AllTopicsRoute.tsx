import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { azFiltered, azLetters, filterApplies, normalizeFilter, topicCard, type AzLang } from "~/lib/topics/topic-model";
import { azSliceQueryOptions } from "~/lib/topics/toc-source";
import { topicListQueryOptions, trendingTopicsQueryOptions } from "~/lib/topics/topics-api";
import { PromoSlot, SidebarFooter, SupportSefaria } from "~/ui/NavSidebar/NavSidebar";
import { GetTheApp, TrendingTopics, topicPageHref } from "~/ui/NavSidebar/TopicModules";
import { AlphabetNav, TopicFilterBox } from "~/ui/TopicsNav/AllTopics";
import { TopicCard, TopicCardGrid } from "~/ui/TopicsNav/TopicCard";
import { AllTopicsPage, TopicsMessage } from "~/ui/TopicsNav/TopicsPages";

export async function loadAllTopics(queryClient: QueryClient, letter: string, lang: AzLang) {
  await Promise.all([queryClient.ensureQueryData(azSliceQueryOptions(letter, lang)).catch(() => undefined), queryClient.ensureQueryData(trendingTopicsQueryOptions(lang)).catch(() => undefined)]);
}

/**
 * `/topics/all/<letter>`: every topic starting with the letter, or, once two characters are typed in the filter, every topic with a
 * title containing them (the old TopicPageAll). The letter's list comes from the server; the whole list (2.9 MB) is fetched only
 * for a filter.
 *
 * @feature TOP-014 All Topics A-Z index
 */
export function AllTopicsRoute({ letter }: { letter: string }) {
  const lang = langCode(useInterfaceLang());
  const [filter, setFilter] = useState("");
  useEffect(() => setFilter(""), [letter]);
  const filtering = filterApplies(normalizeFilter(filter));
  const slice = useQuery(azSliceQueryOptions(letter, lang)).data;
  const all = useQuery({ ...topicListQueryOptions(), enabled: filtering }).data;
  const trending = useQuery(trendingTopicsQueryOptions(lang)).data;
  const topics = useMemo(() => (filtering ? (all ? azFiltered(all, filter, lang) : undefined) : slice), [filtering, all, filter, lang, slice]);
  const cards = topics?.map((t) => topicCard(t)).filter((c) => c !== null);
  return (
    <AllTopicsPage
      filter={<TopicFilterBox value={filter} onChange={setFilter} />}
      letters={<AlphabetNav letters={azLetters(lang)} />}
      cards={
        cards ? (
          cards.length ? (
            <TopicCardGrid>
              {cards.map((c) => (
                <TopicCard key={c.slug} href={topicPageHref(c.slug)} routed title={c.title} description={c.description} analyticsEvent="navto_topic:click" />
              ))}
            </TopicCardGrid>
          ) : (
            <TopicsMessage en="There are no topics here." />
          )
        ) : (
          <TopicsMessage />
        )
      }
      sidebar={
        <>
          <PromoSlot />
          <TrendingTopics topics={trending} />
          <GetTheApp />
          <SupportSefaria />
        </>
      }
      footer={<SidebarFooter />}
    />
  );
}
