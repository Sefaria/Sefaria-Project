import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { categoryAttribution, categoryHref, primaryCategory } from "~/lib/book/book-page";
import { indexDetailsQueryOptions } from "~/lib/catalog/index-details";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { categoryLabel } from "~/lib/connections/terms";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { lastPlace } from "~/lib/reader/last-place";
import { refToUrl } from "~/lib/ref/url";
import { tocStructures, type TocIndexRecord } from "~/lib/toc/model";
import { bookVersionsQueryOptions } from "~/lib/versions/book-versions";
import type { VersionMeta } from "~/lib/text/model";
import { BookPage, type BookTab } from "~/ui/BookPage/BookPage";
import { DownloadVersions } from "~/ui/DownloadVersions/DownloadVersions";
import { RelatedTopics } from "~/ui/RelatedTopics/RelatedTopics";
import { aboutTextMeta } from "~/lib/book/about-text";
import { TocView } from "~/ui/TocView/TocView";
import { DictionarySearch } from "~/ui/DictionarySearch/DictionarySearch";
import { useDictionarySearch } from "../shared/useDictionarySearch";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { SITE_ORIGIN } from "~/lib/config";

type Details = NonNullable<ReturnType<typeof indexDetailsQueryOptions>["queryFn"]> extends never ? never : Awaited<ReturnType<NonNullable<ReturnType<typeof indexDetailsQueryOptions>["queryFn"]>>>;

/**
 * The route for `/<Book>`: the book's page, from the library cache the loader filled.
 *
 * @feature BOK-001 Book page (text table of contents)
 */
export function BookRoute({ title }: { title: string }) {
  const lang = useInterfaceLang();
  const search = useSearch({ strict: false }) as { tab?: BookTab };
  const navigate = useNavigate();
  const details = useQuery(indexDetailsQueryOptions(title)).data as (Details & { schema?: unknown; firstSectionRef?: string; dedication?: { en?: string; he?: string }; dependence?: string; lexiconName?: string; heTitle?: string }) | undefined;
  const versions = useQuery(bookVersionsQueryOptions(title)).data as VersionMeta[] | undefined;
  const catalog = useQuery(tocQueryOptions()).data;
  // "Continue Reading" is known only in the browser, after mount: the server renders "Start Reading"
  const [resume, setResume] = useState<string>();
  useEffect(() => setResume(lastPlace(title)), [title]);
  const structures = useMemo(() => (details?.schema ? tocStructures({ ...(details as unknown as TocIndexRecord), title: details.title }) : []), [details]);
  const dict = useDictionarySearch({ lexiconName: details?.lexiconName, title: details?.title, open: (ref) => void navigate({ to: "/$", params: { _splat: refToUrl(ref) } }) });
  if (!details) return <LoadingState />;

  const first = details.firstSectionRef ?? details.title;
  const cat = primaryCategory(details.categories, details.dependence);
  const label = categoryLabel(cat, catalog);
  const tab: BookTab = search.tab === "versions" ? "versions" : "contents";
  const bookUrl = `/${refToUrl(details.title)}`;
  return (
    <BookPage
      title={{ en: details.title, he: details.heTitle ?? details.title }}
      category={{ ...label, href: categoryHref(details.categories, details.dependence) }}
      attribution={categoryAttribution(details.categories)}
      dedication={details.dedication}
      colorCategory={details.categories[0]}
      readHref={`/${refToUrl(resume ?? first)}`}
      continueReading={Boolean(resume)}
      tab={tab}
      tabHref={(t) => `${bookUrl}?tab=${t}`}
      onTab={(t) => void navigate({ to: "/$", params: { _splat: refToUrl(details.title) }, search: { tab: t } as never, replace: true })}
      contents={
        <>
          {details.lexiconName ? <div style={{ marginBlockEnd: 24 }}><DictionarySearch getCompletions={dict.getCompletions} onSubmit={dict.openEntry} /></div> : null}
          <TocView structures={structures} variant="page" />
        </>
      }
      versions={versions}
      versionHref={(v) => `/${refToUrl(first)}?${v.isPrimary ? "vhe" : "ven"}=${v.languageFamilyName}|${v.versionTitle.replace(/\s/g, "_")}`}
      meta={aboutTextMeta(details)}
      description={{ en: details.enDesc, he: details.heDesc }}
      sidebar={
        <>
          <RelatedTopics topics={details.relatedTopics ?? []} topicHref={(slug) => `${SITE_ORIGIN}/topics/${slug}`} />
          {details.lexiconName ? null : <DownloadVersions title={details.title} versions={(versions ?? []) as never} />}
        </>
      }
    />
  );
  void lang;
}
