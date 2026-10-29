import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { tocQueryOptions } from "~/lib/catalog/toc";
import { hebrewCategoryNames } from "~/lib/library/category-model";
import { refToUrl } from "~/lib/ref/url";
import { versionApiToParam } from "~/lib/workspace/url";
import { useMediaQuery } from "~/lib/ui/use-media-query";
import { topicTocQueryOptions } from "~/lib/topics/topic-toc";
import { entitySearchInfiniteOptions, entitySearchQueryOptions, formatEntityCount, type EntityType } from "~/lib/search/entity-search";
import { buildBookFilterTree, buildFilterTree, SOURCE_SORTS, catalogOrder, countLabel, ENTITY_SORTS, type EntitySort, parseSearchParams, searchHref, searchResultsQueryOptions, searchTreeQueryOptions, toggleFilter, type FilterNode, type SearchParams, type SearchTab } from "~/lib/search/search-page";
import { filteredTotal, mergeHits, scoreSefariaHits } from "~/lib/search/dicta";
import { autocorrectQueryOptions, decideAutocorrect, NO_AUTOCORRECT, type TabCount } from "~/lib/search/autocorrect";
import { highlightsOf, mergeTextResultsVersions, type SearchHit } from "~/lib/search/text-search";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { VisuallyHidden } from "~/ui/VisuallyHidden/VisuallyHidden";
import { NavPage } from "~/ui/NavPage/NavPage";
import { AutocorrectBanner, EntityResults, ExactToggle, MobileFilterButton, MobileFilterPanel, NoResults, PanelSection, SearchError, SearchSkeleton, SearchBar, SearchFilters, SearchResultCard, SearchTabs, SortMenu, SortRadios } from "~/ui/SearchPage/SearchPage";
import { toRouterLocation } from "../shared/RouterLink";
import { searchFlow, tabLabel } from "~/lib/analytics";
import { resultClickHandlers, useSearchFlowAnalytics } from "./use-search-analytics";

const ENTITY_TABS: Partial<Record<SearchTab, EntityType>> = { books: "book", authors: "author", topics: "topic" };

/**
 * `/search?q=…`: the results page — the query box, tabs with counts, All Results / Exact Phrase, sort, source cards with
 * more versions folded under them, the category/book filters, and the Books / Authors / Topics tabs. Everything that changes
 * the search is in the address (a new history entry each), so it is shareable and survives reload.
 *
 * @feature SRC-039 Search URL and server render
 * @feature SRC-040 Search URL parameters
 * @feature SRC-042 Search history and back/forward
 * @feature SRC-046 Sources full-text search results
 * @feature SRC-048 Search tabs: Sources, Books, Authors, Topics
 * @feature SRC-051 In-page search bar
 * @feature SRC-052 Exact phrase vs all results toggle
 * @feature SRC-053 Sources sort dropdown
 * @feature SRC-054 Source result list and version grouping
 * @feature SRC-055 Source result card
 * @feature SRC-057 Open a search result in the reader
 * @feature SRC-061 Infinite scroll for results
 * @feature SRC-064 No-results empty state
 * @feature SRC-066 Books, Authors and Topics result tabs
 * @feature SRC-085 Text filter panel (category/book tree)
 * @feature SRC-104 GA4 search funnel events
 * @feature SRC-106 Search result click analytics
 * @feature SRC-111 Search auto-correction and suggestions
 * @feature SRC-112 Auto-switch away from an empty tab
 */
export function SearchRoute() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const params = useMemo(() => parseSearchParams(raw), [raw]);
  const router = useRouter();
  const go = (next: Partial<SearchParams>, opts: { replace?: boolean } = {}) =>
    void router.navigate({ ...(toRouterLocation(searchHref({ ...params, ...next })) as object), replace: opts.replace } as never);
  const hasQuery = params.q.trim() !== "";
  // The phone layout below 985px wide (the old page's own switch), found after hydration; its panel closes with a tab change
  const mobile = useMediaQuery("(max-width: 985px)");
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => setPanelOpen(false), [params.tab]);

  const catalog = useQuery(tocQueryOptions()).data;
  const order = useMemo(() => (catalog ? catalogOrder(catalog.tree) : new Map<string, number>()), [catalog]);
  const names = useMemo(() => (catalog ? hebrewCategoryNames(catalog.tree) : new Map<string, string>()), [catalog]);

  // ── auto-correction (SRC-111): the query as typed is counted in every tab; a confident correction is searched only when it finds
  // nothing anywhere. Until that is decided nothing is shown (master's ElasticSearchQuerier); the search box keeps the typed text.
  const suggestionQ = useQuery({ ...autocorrectQueryOptions(params.q), enabled: hasQuery && !params.disableAutocorrect });
  const typedSources = useInfiniteQuery({ ...searchResultsQueryOptions(params), enabled: hasQuery });
  const typedEntities = useQueries({ queries: (["book", "author", "topic"] as EntityType[]).map((t) => ({ ...entitySearchQueryOptions(params.q, t), enabled: hasQuery })) });
  const typedCount = (q: { data?: { total: number }; isError: boolean }): TabCount => (q.isError ? "error" : q.data?.total);
  const typedSourcesCount: TabCount = typedSources.isError ? "error" : typedSources.data?.pages[0] ? typedSources.data.pages[0].total + (typedSources.data.pages[0].dicta?.total ?? 0) : undefined;
  const decision = !hasQuery || params.disableAutocorrect
    ? NO_AUTOCORRECT
    : decideAutocorrect({ data: suggestionQ.data, error: suggestionQ.isError }, [typedSourcesCount, ...typedEntities.map((q) => typedCount({ data: q.data, isError: q.isError }))]);
  const decided = !decision.pending;
  const corrected = decision.pending ? null : decision.corrected;
  const searchedQ = corrected ?? params.q;
  const searched = useMemo(() => ({ ...params, q: searchedQ }), [params, searchedQ]);

  const sources = useInfiniteQuery({ ...searchResultsQueryOptions(searched), enabled: hasQuery && decided });
  const treeQ = useQuery({ ...searchTreeQueryOptions(searched), enabled: hasQuery && decided });
  const entityCounts = useQueries({ queries: (["book", "author", "topic"] as EntityType[]).map((t) => ({ ...entitySearchQueryOptions(searchedQ, t), enabled: hasQuery && decided })) });
  const entityType = ENTITY_TABS[params.tab];
  // Sorting and the Books category filter live in the page, not the address (VERIFIED on sefaria.org: the URL does not change)
  const [entitySort, setEntitySort] = useState<Record<EntityType, EntitySort>>({ book: "relevance", author: "relevance", topic: "relevance" });
  const [bookFilters, setBookFilters] = useState<string[]>([]);
  useEffect(() => { setEntitySort({ book: "relevance", author: "relevance", topic: "relevance" }); setBookFilters([]); }, [searchedQ]);
  const topicParents = useQuery({ ...topicTocQueryOptions(), enabled: entityType === "author" || entityType === "topic" }).data;
  const entities = useInfiniteQuery({ ...entitySearchInfiniteOptions(searchedQ, entityType ?? "book", entityType ? entitySort[entityType] : "relevance", entityType === "book" ? bookFilters : []), enabled: hasQuery && decided && !!entityType });
  const bookTree = useMemo(() => (catalog ? buildBookFilterTree(catalog.tree, entityCounts[0]?.data?.categoryCounts, bookFilters) : []), [catalog, entityCounts[0]?.data, bookFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  const tree = useMemo(() => (treeQ.data ? buildFilterTree(treeQ.data.buckets, params.filters, order, (c) => names.get(c) ?? c) : []), [treeQ.data, params.filters, order, names]);
  // A Hebrew "All Results" search merges Dicta's Tanakh verses in (SRC-082), re-sorting everything loaded so far, as sefaria.org does
  const withDicta = !!sources.data?.pages[0]?.dicta;
  const hits = useMemo(() => {
    if (!sources.data) return undefined;
    const sefaria = sources.data.pages.flatMap((pg) => pg.hits);
    const merged = withDicta ? mergeHits(scoreSefariaHits(sefaria), sources.data.pages.flatMap((pg) => pg.dicta?.hits ?? []), params.sort) : sefaria;
    return mergeTextResultsVersions(merged.filter((h) => !!h._source.version));
  }, [sources.data, withDicta, params.sort]);
  const first0 = sources.data?.pages[0];
  // the total: Sefaria's plus Dicta's ("10,182+"); with filters on, the sum of the merged tree's counts under them
  const first = first0 && withDicta
    ? params.filters.length && treeQ.data
      ? { ...first0, total: filteredTotal(treeQ.data.buckets, params.filters), relation: "eq" as const }
      : { ...first0, total: first0.total + (first0.dicta?.total ?? 0) }
    : first0;
  const counts: Partial<Record<SearchTab, string>> = {
    ...(first ? { sources: countLabel(first.total, first.relation) } : {}),
    // VERIFIED on sefaria.org: the Books badge follows the category filter (4 of 10 after choosing Halakhah)
    ...(entityCounts[0]?.data ? { books: formatEntityCount(params.tab === "books" && bookFilters.length && entities.data ? entities.data.pages[0]!.total : entityCounts[0].data.total) } : {}),
    ...(entityCounts[1]?.data ? { authors: formatEntityCount(entityCounts[1].data.total) } : {}),
    ...(entityCounts[2]?.data ? { topics: formatEntityCount(entityCounts[2].data.total) } : {}),
  };

  // The search funnel (SRC-104…108): the APIs' first answers, the old per-query Track event
  useSearchFlowAnalytics(
    params.q,
    params.tab,
    {
      sources: { total: first0?.total, error: sources.isError ? sources.error : undefined },
      books: { total: entityCounts[0]?.data?.total, error: entityCounts[0]?.isError ? entityCounts[0].error : undefined },
      authors: { total: entityCounts[1]?.data?.total, error: entityCounts[1]?.isError ? entityCounts[1].error : undefined },
      topics: { total: entityCounts[2]?.data?.total, error: entityCounts[2]?.isError ? entityCounts[2].error : undefined },
    },
    first0 && hasQuery ? { total: first0.total, filters: params.filters, key: first0 } : undefined,
  );
  const rawCount = (t: SearchTab): number | undefined =>
    t === "sources" ? first?.total : entityCounts[["books", "authors", "topics"].indexOf(t)]?.data?.total;
  const onTabClick = (t: SearchTab) => {
    // reported before the tab changes: `tab` is the one being left, element_value the destination
    if (t !== params.tab) searchFlow.elementClicked({ elementType: "tab", elementValue: tabLabel(t), count: rawCount(t) });
    pickedTabFor.current = params.q;
    go({ tab: t });
  };

  // ── auto-switch (SRC-112): when the tab on screen is empty, the first tab with results, once every earlier tab's count is in;
  // decided once per (query, correction); never once the reader chose a tab for this query. Replaces the entry; not a tab click.
  const pickedTabFor = useRef<string | null>(null);
  const switchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!hasQuery || !decided) return;
    const key = `${params.q}\u0000${searchedQ}`;
    if (pickedTabFor.current === params.q || switchedFor.current === key) return;
    const count = (t: SearchTab): number | undefined => (t === "sources" ? first?.total : entityCounts[["books", "authors", "topics"].indexOf(t)]?.data?.total);
    const here = count(params.tab);
    if (here === undefined) return;
    if (here > 0) {
      switchedFor.current = key;
      return;
    }
    for (const t of ["sources", "books", "authors", "topics"] as const) {
      const c = count(t);
      if (c === undefined) return; // wait for it
      if (c > 0) {
        switchedFor.current = key;
        if (t !== params.tab) go({ tab: t }, { replace: true });
        return;
      }
    }
    switchedFor.current = key; // nothing anywhere: stay
  });
  const onSourcesSort = (sort: SearchParams["sort"]) => {
    if (sort === params.sort) return;
    searchFlow.elementClicked({ elementType: "sort", elementValue: SOURCE_SORTS.find((o) => o.value === sort)?.en ?? sort });
    go({ sort });
  };
  const onEntitySort = (type: EntityType, v: EntitySort) => {
    if (entitySort[type] === v) return;
    searchFlow.elementClicked({ elementType: "sort", elementValue: ENTITY_SORTS[type].find((o) => o.value === v)?.en ?? v });
    setEntitySort((cur) => ({ ...cur, [type]: v }));
  };
  const onExact = (exact: boolean) => {
    if (exact === params.exact) return;
    searchFlow.elementClicked({ elementType: "toggle", elementValue: exact ? "Exact Phrase" : "All Results" });
    go({ exact });
  };

  // More results as the list reaches its end
  const sentinel = useRef<HTMLDivElement>(null);
  const active = entityType ? entities : sources;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !active.hasNextPage || active.isFetchingNextPage || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && void active.fetchNextPage(), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [active.hasNextPage, active.isFetchingNextPage, active.fetchNextPage, hits?.length, entities.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const hitHref = (h: SearchHit) => {
    const s = h._source;
    return `/${refToUrl(s.ref)}?${s.isPrimary ? "vhe" : "ven"}=${versionApiToParam(`${s.languageFamilyName}|${s.version}`)}`;
  };
  const openHit = (h: SearchHit) => void router.navigate({ ...(toRouterLocation(hitHref(h)) as object), state: { nav: "go", terms: highlightsOf(h) } } as never);

  const onToggle = (node: FilterNode) => {
    searchFlow.elementClicked({ elementType: "filter", elementValue: node.title, count: node.count });
    go({ filters: toggleFilter(node, params.filters, tree) });
  };
  const onToggleBook = (node: FilterNode) => {
    searchFlow.elementClicked({ elementType: "filter", elementValue: node.title, count: node.count });
    setBookFilters((cur) => toggleFilter(node, cur, bookTree));
  };

  let body;
  if (!hasQuery) body = null;
  else if (entityType) {
    const list = entities.data?.pages.flatMap((p) => p.hits);
    body = entities.isError && !list ? <SearchError onRetry={() => void entities.refetch()} /> : !list ? <p role="status" style={{ textAlign: "center" }}><InterfaceText en="Searching..." he="מבצע חיפוש..." /></p> : <EntityResults type={entityType} hits={list} topicParents={topicParents} itemProps={(h, i) => resultClickHandlers(h.title_en || h.title_he, i + 1)} empty={<NoResults tab={params.tab} query={searchedQ} />} />;
  } else if (sources.isError && !hits) body = <SearchError onRetry={() => void sources.refetch()} />;
  else if (!hits) body = null; // the skeleton below stands in while the first query runs
  else if (!hits.length) body = <NoResults tab="sources" query={searchedQ} />;
  else
    body = (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 20 }} aria-label="Search results">
        {hits.map((h, i) => (
          <li key={h._id} {...resultClickHandlers(h._source.ref, i + 1)}><SearchResultCard hit={h} hrefFor={hitHref} onOpen={openHit} /></li>
        ))}
      </ul>
    );

  const skeleton = hasQuery && (!decided || (params.tab === "sources" && !hits && !sources.isError));
  return (
    <NavPage
      top={{ main: 64, side: 142 }}
      sidebar={
        // the filters need the catalog's order and names, which are not in the page (R-14): they appear once it is here
        mobile || !catalog ? undefined
        : params.tab === "sources" && hasQuery && tree.length ? <SearchFilters tree={tree} applied={params.filters} onToggle={onToggle} />
        : params.tab === "books" && hasQuery && bookTree.length ? <SearchFilters tree={bookTree} applied={bookFilters} onToggle={onToggleBook} />
        : undefined
      }
    >
      {/* the page's heading, for screen readers (sefaria.org shows none; the search box says it visually) */}
      <VisuallyHidden as="h1">{hasQuery ? <InterfaceText en={`Search results for “${params.q}”`} he={`תוצאות חיפוש עבור ”${params.q}“`} /> : <InterfaceText en="Search" he="חיפוש" />}</VisuallyHidden>
      <SearchBar query={params.q} onSubmit={(q) => go({ q, filters: [], disableAutocorrect: false })} />
      {hasQuery ? (
        <AutocorrectBanner
          corrected={corrected}
          original={params.q}
          suggested={decision.pending ? null : decision.suggested}
          onSearchOriginal={() => go({ disableAutocorrect: true })}
          onSearch={(q) => go({ q, filters: [], disableAutocorrect: false })}
        />
      ) : null}
      {skeleton ? <SearchSkeleton /> : hasQuery ? (
        <>
          <SearchTabs mobile={mobile} active={params.tab} counts={counts} hrefFor={(t) => searchHref({ ...params, tab: t })} onTab={onTabClick} />
          {mobile ? (
            <MobileFilterButton onClick={() => setPanelOpen(true)} />
          ) : params.tab === "sources" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBlockEnd: 18 }}>
              <ExactToggle exact={params.exact} onChange={onExact} />
              <SortMenu sort={params.sort} onChange={onSourcesSort} disabled={first?.total === 0} />
            </div>
          ) : entityType ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: 18 }}>
              <SortMenu sort={entitySort[entityType]} options={ENTITY_SORTS[entityType]} onChange={(v) => onEntitySort(entityType, v)} disabled={entities.data?.pages[0]?.hits.length === 0} />
            </div>
          ) : null}
          {mobile && panelOpen ? (
            <MobileFilterPanel title={<InterfaceText en={params.tab === "sources" ? "Filters" : params.tab === "books" ? "Filter" : "Sort"} he={params.tab === "sources" ? "פילטרים" : params.tab === "books" ? "סינון" : "מיון"} />} onClose={() => setPanelOpen(false)}>
              {params.tab === "sources" ? (
                <>
                  <PanelSection title={<InterfaceText en="Search Type" he="סוג חיפוש" />}><ExactToggle block exact={params.exact} onChange={onExact} /></PanelSection>
                  <PanelSection title={<InterfaceText en="Sort by" he="מיון לפי" />}><SortRadios name="sort" value={params.sort} options={SOURCE_SORTS} onChange={onSourcesSort} /></PanelSection>
                  {tree.length ? <PanelSection title={<InterfaceText en="Filters" he="סינונים" />}><SearchFilters tree={tree} applied={params.filters} onToggle={onToggle} /></PanelSection> : null}
                </>
              ) : (
                <>
                  {entityType ? <PanelSection title={<InterfaceText en="Sort by" he="מיון לפי" />}><SortRadios name="esort" value={entitySort[entityType]} options={ENTITY_SORTS[entityType]} onChange={(v) => onEntitySort(entityType, v)} /></PanelSection> : null}
                  {params.tab === "books" && bookTree.length ? <PanelSection title={<InterfaceText en="Filters" he="סינונים" />}><SearchFilters tree={bookTree} applied={bookFilters} onToggle={onToggleBook} /></PanelSection> : null}
                </>
              )}
            </MobileFilterPanel>
          ) : null}
          {body}
          <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
          {active.isFetchingNextPage ? <p role="status" style={{ textAlign: "center" }}><InterfaceText en="Loading more results..." he="טוען עוד תוצאות..." /></p> : null}
          {active.isFetchNextPageError ? <SearchError more onRetry={() => void active.fetchNextPage()} /> : null}
        </>
      ) : null}
    </NavPage>
  );
}
