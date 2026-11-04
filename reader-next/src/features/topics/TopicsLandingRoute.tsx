import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { isValidEmail } from "~/lib/feedback/feedback";
import { calendarsQueryOptions, parashah } from "~/lib/library/calendars";
import { useMediaQuery } from "~/lib/ui/use-media-query";
import { isHebrewText } from "~/lib/search/hebrew";
import { deckPoolSize, describedDeck, generalPool, topicSuggestions, type AzLang } from "~/lib/topics/topic-model";
import { numLibraryTopicsQueryOptions, topicTocIndexQueryOptions, topicTocPageQueryOptions } from "~/lib/topics/toc-source";
import {
  featuredTopicQueryOptions,
  subscribeTopicsNewsletter,
  topicNameQueryOptions,
  topicNewsletterLists,
  topicPoolQueryOptions,
  trendingTopicsQueryOptions,
  upcomingDayQueryOptions,
} from "~/lib/topics/topics-api";
import { PromoSlot, SidebarFooter } from "~/ui/NavSidebar/NavSidebar";
import { AZTopicsLink, BrowseTopics, TrendingTopics, topicPageHref } from "~/ui/NavSidebar/TopicModules";
import { FeaturedTopic, ParashaCard, SeasonalCard, TopicDeck, TopicLandingSearch, TopicNewsletter, TopicSalad } from "~/ui/TopicsNav/TopicLanding";
import { TopicsLandingPage } from "~/ui/TopicsNav/TopicsPages";

const PHONE = "(max-width: 842px)";

/** What the server puts in the landing page: everything but the random samples (the cloud and the cards, as the old page fetched them). */
export async function loadTopicsLanding(queryClient: QueryClient, lang: AzLang, diaspora: boolean) {
  const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
  await Promise.all([
    quiet(queryClient.ensureQueryData(topicTocPageQueryOptions(""))),
    quiet(queryClient.ensureQueryData(numLibraryTopicsQueryOptions())),
    quiet(queryClient.ensureQueryData(trendingTopicsQueryOptions(lang))),
    quiet(queryClient.ensureQueryData(featuredTopicQueryOptions(lang))),
    quiet(queryClient.ensureQueryData(upcomingDayQueryOptions("parasha", lang))),
    quiet(queryClient.ensureQueryData(upcomingDayQueryOptions("holiday", lang))),
    quiet(queryClient.ensureQueryData(calendarsQueryOptions(diaspora))),
  ]);
}

/** Random samples only after mount: the server and the first client render agree (empty), then the browser asks. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/**
 * `/topics` on the Library: the topics landing page (the old TopicsLandingPage).
 *
 * @feature TOP-002 Module-specific topics home
 * @feature TOP-003 Topics landing page layout
 */
export function TopicsLandingRoute() {
  const lang = langCode(useInterfaceLang());
  const { diaspora } = useRouteContext({ from: "__root__" });
  const phone = useMediaQuery(PHONE);
  const mounted = useMounted();

  const cats = useQuery(topicTocPageQueryOptions("")).data?.entries;
  const count = useQuery(numLibraryTopicsQueryOptions()).data;
  const trending = useQuery(trendingTopicsQueryOptions(lang)).data;
  const featured = useQuery(featuredTopicQueryOptions(lang)).data;
  const parasha = useQuery(upcomingDayQueryOptions("parasha", lang)).data;
  const holiday = useQuery(upcomingDayQueryOptions("holiday", lang)).data;
  const calendars = useQuery(calendarsQueryOptions(diaspora)).data;
  const salad = useQuery({ ...topicPoolQueryOptions(generalPool(lang), 50), enabled: mounted }).data;
  const deckSize = phone ? 10 : 3;
  const deckPool = useQuery({ ...topicPoolQueryOptions(generalPool(lang), deckPoolSize(deckSize)), enabled: mounted }).data;

  // the search: names after two characters, each with its category path from the topics TOC
  const [word, setWord] = useState("");
  const typed = word.trim().length > 1;
  const names = useQuery({ ...topicNameQueryOptions(word), enabled: typed }).data;
  const index = useQuery({ ...topicTocIndexQueryOptions(), enabled: typed }).data;
  const suggestions = useMemo(() => {
    if (!typed || !names) return [];
    const sl: AzLang = isHebrewText(word.trim()) ? "he" : "en";
    return topicSuggestions(names, sl, (slug) => index?.paths[slug]?.map((c) => index.titles[c]!).filter(Boolean));
  }, [typed, names, index, word]);

  const reading = calendars && parashah(calendars);
  const teaser = lang === "he" ? "הירשמו למיילים של ספריא כדי לקבל עדכונים על מקורות, כותרים וכלים חדשים." : "Stay curious. Get the Timeless Topics newsletter every Tuesday.";
  return (
    <TopicsLandingPage
      search={<TopicLandingSearch numOfTopics={count} suggestions={suggestions} onInput={setWord} onChoose={(slug) => window.location.assign(topicPageHref(slug))} />}
      salad={<TopicSalad items={salad} phone={phone} topicHref={topicPageHref} />}
      featured={<FeaturedTopic topic={featured ? { ...featured, imageUrl: featured.secondary_image_uri, imageCaption: featured.image?.image_caption } : featured} topicHref={topicPageHref} />}
      newsletter={
        <TopicNewsletter
          validEmail={isValidEmail}
          subscribe={(f, l, e) => subscribeTopicsNewsletter(f, l, e, lang)}
          analytics={{ text: teaser, feature_name: "Newsletter Signup Form", version: lang, form_name: "newsletter_topics", form_destination: topicNewsletterLists(lang).join(", ") }}
        />
      }
      deck={<TopicDeck topics={deckPool ? describedDeck(deckPool, lang, deckSize) : []} topicHref={topicPageHref} />}
      parasha={<ParashaCard parasha={parasha} reading={reading ? { url: reading.url, ref: { en: reading.ref, he: reading.heRef ?? reading.ref } } : undefined} topicHref={topicPageHref} />}
      seasonal={
        <SeasonalCard
          seasonal={holiday ? { topic: holiday.topic, secondaryTopic: holiday.secondary_topic, start: holiday.display_start_date, end: holiday.display_end_date, prefix: holiday.display_date_prefix, suffix: holiday.display_date_suffix } : null}
          topicHref={topicPageHref}
        />
      }
      sidebar={
        <>
          {cats ? <BrowseTopics categories={cats} /> : null}
          <TrendingTopics topics={trending} />
          <AZTopicsLink />
          <PromoSlot />
        </>
      }
      footer={<SidebarFooter />}
    />
  );
}
