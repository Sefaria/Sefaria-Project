import { useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { notFound, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { viewerQuery, useViewer } from "~/features/auth/viewer";
import { SITE_ORIGIN } from "~/lib/config";
import { isValidEmail } from "~/lib/feedback/feedback";
import { langCode, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { postJson } from "~/lib/auth/http";
import {
  DEFAULT_SORT,
  DISPLAY_PAGE_SIZE,
  LANG_CHOICES,
  REF_SORT_OPTIONS,
  TOPIC_PAGE_SIZE,
  TOPIC_SPONSORSHIPS,
  WORKS_TAB,
  activeTab,
  aliyaLabel,
  bucketTabs,
  cardDisplay,
  cardModeOf,
  hasAiContent,
  hebrewCalendarDate,
  langChoiceOf,
  learnMoreLinks,
  legacyNormRef,
  linksToGenerate,
  linksToPublish,
  localeDate,
  normHebrewRef,
  normalizeTopicSlug,
  pseudoTabs,
  refMatches,
  sideSections,
  sortSources,
  sourceAnalytics,
  topicPageSearch,
  visibleTabs,
  type ContentLangPref,
  type SourceTabKey,
  type SourceText,
  type TopicPageModel,
  type TopicSource,
} from "~/lib/topics/topic-page";
import { generatePrompts, markReviewed, nextReadQueryOptions, portalQueryOptions, publishPrompts, sourceTextsQueryOptions, topicPageQueryOptions } from "~/lib/topics/topic-page-source";
import type { AzLang } from "~/lib/topics/topic-model";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { SidebarFooter } from "~/ui/NavSidebar/NavSidebar";
import { categoryColor } from "~/ui/tokens/category-color";
import { TopicNewsletter } from "~/ui/TopicsNav/TopicLanding";
import { SourceCard, type ReviewState } from "~/ui/TopicPage/SourceCard";
import { AuthorWorks, SourceFilterBar, TopicHeader, TopicPageLayout, TopicPageMessage, TopicTabs } from "~/ui/TopicPage/TopicPage";
import { PortalModules, TopicSideColumn } from "~/ui/TopicPage/TopicSide";

const chunk = <T,>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The tabs as the reader sees them (the Admin tab for moderators). */
function tabsFor(page: TopicPageModel, lang: AzLang, moderator: boolean) {
  const tabs = bucketTabs(page.refs, lang, moderator);
  return { tabs, entries: visibleTabs(tabs, page.works) };
}

/**
 * What the server puts in the page: the topic (404 for one that does not exist or is not the Library's; Django's own page when its
 * pool cannot be confirmed), the first 70 texts of the tab shown, the portion's next reading and a portal's modules.
 */
export async function loadTopicPage(queryClient: QueryClient, slug: string, lang: AzLang, tab: string | undefined, transLangPref: string | undefined) {
  const [result, viewer] = await Promise.all([queryClient.ensureQueryData(topicPageQueryOptions(slug, lang)), queryClient.ensureQueryData(viewerQuery).catch(() => null)]);
  if (result.kind !== "page") throw notFound();
  const page = result.page;
  const { tabs, entries } = tabsFor(page, lang, !!viewer?.isStaff);
  const current = activeTab(entries, tab);
  const quiet = (p: Promise<unknown>) => p.catch(() => undefined);
  const first = current && current !== WORKS_TAB ? tabs[current]?.refs.slice(0, TOPIC_PAGE_SIZE).map((r) => r.ref) : undefined;
  await Promise.all([
    first?.length ? quiet(queryClient.ensureQueryData(sourceTextsQueryOptions(first, transLangPref))) : undefined,
    page.parasha ? quiet(queryClient.ensureQueryData(nextReadQueryOptions(page.parasha))) : undefined,
    page.portalSlug ? quiet(queryClient.ensureQueryData(portalQueryOptions(page.portalSlug))) : undefined,
  ]);
  return page;
}

/** How many sources each tab showed, kept for the session (the old _refsDisplayedByTab: back to the page, the list is as long). */
const shownByTab = new Map<string, number>();

export interface TopicPageRouteProps {
  slug: string;
  /** "" or "b/" (the old test version, /topics/b/<slug>). */
  prefix: string;
  search: { sort?: string; tab?: string };
  transLangPref?: string;
}

/**
 * `/topics/<slug>` on the Library: a topic's page (the old TopicPage).
 *
 * @feature TOP-001 Topic URLs and legacy redirects
 * @feature TOP-015 Topic page data loading
 * @feature TOP-020 Topic page tabs
 * @feature TOP-021 Topic source incremental loading
 * @feature TOP-022 Topic source filter and sort
 * @feature TOP-029 Topic page analytics batch
 */
export function TopicPageRoute({ slug, prefix, search, transLangPref }: TopicPageRouteProps) {
  const ifl = useInterfaceLang();
  const lang = langCode(ifl);
  const navigate = useNavigate();
  const viewer = useViewer();
  const moderator = !!viewer?.isStaff;
  const result = useQuery(topicPageQueryOptions(slug, lang)).data;
  const page = result?.kind === "page" ? result.page : undefined;
  const { tabs, entries } = useMemo(() => (page ? tabsFor(page, lang, moderator) : { tabs: {}, entries: [] }), [page, lang, moderator]);
  const current = activeTab(entries, search.tab);
  const sort = search.sort ?? DEFAULT_SORT;

  // the old ReaderApp wrote the page's address once the tabs were there: topics/<slug>?sort=<sort>&tab=<first tab> (replacing)
  const path = `/topics/${prefix}${slug}`;
  useEffect(() => {
    if (!page) return;
    if (search.sort === sort && search.tab === current && window.location.pathname === encodeURI(path)) return;
    void navigate({ to: path as never, search: topicPageSearch(sort, current) as never, replace: true, resetScroll: false });
  }, [page, path, sort, current, search.sort, search.tab, navigate]);

  const [langPref, setLangPref] = useState<ContentLangPref>(ifl);
  const [filterOpen, setFilterOpen] = useState(false);

  const go = useCallback((next: { sort?: string; tab?: string }) => void navigate({ to: path as never, search: topicPageSearch(next.sort ?? sort, next.tab ?? current) as never, resetScroll: false }), [navigate, path, sort, current]);

  // links in the description to this site's pages open here (the old ReaderApp handled every in-app link)
  const onDescriptionClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(a.href, window.location.href);
      const site = SITE_ORIGIN ? new URL(SITE_ORIGIN, window.location.href).host : window.location.host;
      if (url.host !== window.location.host && url.host !== site) return;
      e.preventDefault();
      void navigate({ href: url.pathname + url.search });
    },
    [navigate],
  );

  if (!page) return <LoadingState />;

  const aboutRefs = page.refs.find((g) => g.linkType === "about")?.refs ?? [];
  const toGenerate = moderator ? linksToGenerate(aboutRefs, lang) : [];
  const toPublish = moderator ? linksToPublish(aboutRefs, lang) : [];
  const pseudo = pseudoTabs(entries, current);
  const dedication = page.ref ? TOPIC_SPONSORSHIPS[page.slug] : undefined;

  const header = (
    <TopicHeader
      title={page.primaryTitle}
      admin={
        moderator && (toGenerate.length || toPublish.length)
          ? {
              buttons: [
                ...(toGenerate.length
                  ? [{ en: "Generate", he: "Generate", onClick: () => void generatePrompts(page.slug, toGenerate.map((s) => s.ref)).then((refs) => alert(`The following prompts are generating: ${refs.join(", ")}`), (e) => console.error("Error occurred:", e)) }]
                  : []),
                ...(toPublish.length
                  ? [
                      {
                        en: "Publish",
                        he: "Publish",
                        onClick: () =>
                          void publishPrompts(page.slug, toPublish.map((s) => s.ref), lang).then(
                            (refs) => confirm(`The following prompts have been published: ${refs.join(", ")}. Refresh page to see results?`) && window.location.reload(),
                            (e) => console.error("Error occurred:", e),
                          ),
                      },
                    ]
                  : []),
              ],
            }
          : undefined
      }
      aiNotice={aboutRefs.some((s) => hasAiContent(lang, s))}
      {...(page.category ? { category: { href: `/topics/category/${page.category.slug}`, en: page.category.en, he: page.category.he } } : {})}
      {...(dedication ? { dedication } : {})}
      {...(page.description ? { description: page.description } : {})}
      {...(page.image ? { image: page.image } : {})}
      {...(page.ref
        ? { refButton: { href: `/${page.ref.url}`, en: page.parasha ? "Read the Portion" : page.ref.en, he: page.parasha ? "קראו את הפרשה" : normHebrewRef(page.ref.he), studyCompanion: lang === "en" } }
        : {})}
      onDescriptionClick={onDescriptionClick}
    />
  );

  const tabView = entries.length ? (
    <TopicTabs
      tabs={entries}
      current={current}
      onSelect={(id) => id !== current && go({ tab: id })}
      {...(pseudo.filter ? { filter: { open: filterOpen, onToggle: () => setFilterOpen((o) => !o), sort } } : {})}
      {...(pseudo.lang ? { language: { choice: langChoiceOf(langPref), choices: LANG_CHOICES, onChoose: (id: string) => setLangPref(LANG_CHOICES.find((c) => c.id === id)!.pref) } } : {})}
    >
      {current === WORKS_TAB ? (
        <AuthorWorks works={page.works.map((w) => ({ href: w.url, title: w.title, description: w.description }))} />
      ) : current ? (
        <SourceTab
          key={current}
          page={page}
          tab={current}
          refs={tabs[current]?.refs ?? []}
          lang={lang}
          sort={sort}
          onSort={(s) => go({ sort: s })}
          filterOpen={filterOpen}
          langPref={langPref}
          transLangPref={transLangPref}
          moderator={moderator}
        />
      ) : null}
    </TopicTabs>
  ) : null;

  return (
    <TopicPageLayout
      batch={{ project: "topics", content_lang: langPref || "bilingual", ...(page.panelCategory ? { panel_category: page.panelCategory } : {}) }}
      main={
        <>
          {header}
          {tabView}
        </>
      }
      sideKind={page.portalSlug ? "portal" : "topic"}
      side={page.portalSlug ? <PortalSide slug={page.portalSlug} lang={lang} /> : <TopicSide page={page} lang={lang} />}
    />
  );
}

function TopicSide({ page, lang }: { page: TopicPageModel; lang: AzLang }) {
  const reading = useQuery({ ...nextReadQueryOptions(page.parasha ?? ""), enabled: !!page.parasha }).data;
  const sections = useMemo(() => sideSections(page, lang), [page, lang]);
  const timePeriod = page.timePeriod;
  return (
    <TopicSideColumn
      {...(page.image ? { image: page.image } : {})}
      {...(timePeriod ? { lived: timePeriod } : {})}
      learnMore={learnMoreLinks(page.learnMore, lang)}
      {...(reading && page.ref
        ? {
            readings: {
              date: { en: localeDate(reading.date, "en"), he: localeDate(reading.date, "he") },
              hebrewDate: { en: hebrewCalendarDate(reading.date, lang), he: hebrewCalendarDate(reading.date, lang) },
              torah: { href: `/${page.ref.url}`, en: page.ref.en, he: normHebrewRef(page.ref.he) },
              aliyot: reading.aliyot.map((a, i) => ({ href: `/${legacyNormRef(a)}`, ref: a, ...aliyaLabel(i) })),
              haftarot: reading.haftarot.map((h) => ({ href: `/${h.url}`, en: h.en, he: normHebrewRef(h.he) })),
            },
          }
        : {})}
      sections={sections.map((s) => ({ title: s.title, links: s.links.map((l) => ({ href: `/topics/${l.isCategory ? "category/" : ""}${l.topic}`, title: l.title })) }))}
    />
  );
}

/** Sefaria.subscribeSefariaAndSteinsaltzNewsletter: the Sefaria list and the partner's, both at once. */
async function subscribePortalNewsletter(first: string, last: string, email: string, lang: AzLang) {
  const [a, b] = await Promise.all([
    postJson(`/api/subscribe/${email}`, { language: lang, educator: false, firstName: first, lastName: last }),
    postJson(`/api/subscribe/steinsaltz/${email}`, { firstName: first, lastName: last }),
  ]);
  for (const r of [a, b]) {
    if (r.networkError) throw new Error("");
    if (!r.ok) throw new Error("Error posting to API");
    if (typeof r.data.error === "string") throw new Error(r.data.error);
  }
}

function PortalSide({ slug, lang }: { slug: string; lang: AzLang }) {
  const portal = useQuery(portalQueryOptions(slug)).data;
  if (!portal) return null;
  return (
    <>
      <PortalModules
        {...(portal.about ? { about: portal.about } : {})}
        {...(portal.mobile ? { mobile: portal.mobile } : {})}
        {...(portal.organization ? { organization: portal.organization } : {})}
        {...(portal.newsletter
          ? { newsletter: { ...portal.newsletter, form: <TopicNewsletter subscribe={(f, l, e) => subscribePortalNewsletter(f, l, e, lang)} validEmail={isValidEmail} analytics={{ feature_name: "portal newsletter" }} /> } }
          : {})}
      />
      <SidebarFooter />
    </>
  );
}

interface SourceTabProps {
  page: TopicPageModel;
  tab: SourceTabKey;
  refs: readonly TopicSource[];
  lang: AzLang;
  sort: string;
  onSort: (s: string) => void;
  filterOpen: boolean;
  langPref: ContentLangPref;
  transLangPref?: string;
  moderator: boolean;
}

/**
 * One tab's sources (the old TopicPageTab + FilterableList): every text fetched 70 at a time in order, sorted and filtered, shown
 * 20 more at a time as the reader nears the bottom.
 */
function SourceTab({ page, tab, refs, lang, sort, onSort, filterOpen, langPref, transLangPref, moderator }: SourceTabProps) {
  const queryClient = useQueryClient();
  const chunks = useMemo(() => chunk(refs.map((r) => r.ref), TOPIC_PAGE_SIZE), [refs]);
  // one chunk after another (the old useIncrementalLoad): chunk i is asked for once chunk i-1 is in
  let frontier = 1;
  while (frontier < chunks.length && queryClient.getQueryData(sourceTextsQueryOptions(chunks[frontier - 1]!, transLangPref).queryKey)) frontier++;
  const results = useQueries({ queries: chunks.map((c, i) => ({ ...sourceTextsQueryOptions(c, transLangPref), enabled: i < frontier })) });
  const texts = useMemo(() => {
    const out: Record<string, SourceText> = {};
    for (const r of results) if (r.data) Object.assign(out, r.data);
    return out;
  }, [results]);
  const loadedCount = useMemo(() => {
    let n = 0;
    for (let i = 0; i < chunks.length && results[i]?.data; i++) n += chunks[i]!.length;
    return n;
  }, [chunks, results]);

  const [filter, setFilter] = useState("");
  const key = `${page.slug}|${tab}`;
  const [shown, setShown] = useState(() => shownByTab.get(key) ?? DISPLAY_PAGE_SIZE);
  useEffect(() => void shownByTab.set(key, shown), [key, shown]);

  const items = useMemo(() => {
    const loaded = refs.slice(0, loadedCount);
    const sorted = sortSources(loaded, sort, lang);
    return filter ? sorted.filter((s) => refMatches(filter, s, texts[s.ref], s.index ? page.indexes[s.index] : undefined)) : sorted;
  }, [refs, loadedCount, sort, lang, filter, texts, page.indexes]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= items.length) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setShown((n) => n + DISPLAY_PAGE_SIZE), { rootMargin: "0px 0px 600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, items.length]);

  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  if (!results[0]?.data) return <TopicPageMessage />;
  const mode = cardModeOf(tab);
  const shownItems = items.slice(0, shown);
  let opened = false;
  return (
    <div>
      {filterOpen ? (
        <SourceFilterBar
          filter={filter}
          onFilter={setFilter}
          options={REF_SORT_OPTIONS.map((o) => ({ id: o, en: o, he: o === "Relevance" ? "רלוונטיות" : "כרונולוגי" }))}
          sort={sort}
          onSort={onSort}
        />
      ) : null}
      <div data-anl-feature_name="source_filter">
        {shownItems.map((s, position) => {
          const text = texts[s.ref] ?? { ref: s.ref };
          const meta = s.index ? page.indexes[s.index] : undefined;
          const d = cardDisplay(mode, s, text, langPref, lang);
          // the first curated source on the page opens (the old TopicPageTab effect opened the first <details>)
          const open = d.visible && d.introduced && !opened;
          if (open) opened = true;
          const review = mode === "admin" && s.descriptions;
          return (
            <SourceCard
              key={s.ref}
              analytics={sourceAnalytics(position, s, meta, lang)}
              visible={d.visible}
              color={categoryColor(meta?.primaryCategory ?? "Other")}
              href={`/${legacyNormRef(text.ref || s.ref)}`}
              citation={{ en: s.ref, he: text.heRef ?? s.ref }}
              text={{ ...(text.en ? { en: text.en } : {}), ...(text.he ? { he: text.he } : {}) }}
              language={d.language}
              {...(d.introduced
                ? {
                    intro: {
                      title: { en: s.descriptions?.en?.title, he: s.descriptions?.he?.title },
                      prompt: { en: s.descriptions?.en?.prompt, he: s.descriptions?.he?.prompt },
                      categoryLabel: (lang === "he" ? meta?.heCategory ?? meta?.primaryCategory ?? "" : meta?.primaryCategory ?? "").toUpperCase(),
                      open,
                    },
                  }
                : {})}
              {...(review && moderator
                ? {
                    review: {
                      ...(s.descriptions?.en?.review_state ? { en: (reviews[`${s.ref}|en`] ?? s.descriptions.en.review_state) as ReviewState } : {}),
                      ...(s.descriptions?.he?.review_state ? { he: (reviews[`${s.ref}|he`] ?? s.descriptions.he.review_state) as ReviewState } : {}),
                      onMark: (l: AzLang) =>
                        void markReviewed(page.slug, s.ref, l).then(
                          () => setReviews((r) => ({ ...r, [`${s.ref}|${l}`]: "reviewed" })),
                          () => alert(lang === "he" ? "משהו השתבש. עמכם הסליחה." : "Something went wrong. Sorry!"),
                        ),
                    },
                  }
                : {})}
            />
          );
        })}
      </div>
      {loadedCount < refs.length || shown < items.length ? <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} /> : null}
    </div>
  );
}
