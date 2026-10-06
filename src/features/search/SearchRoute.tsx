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
import { highlightsOf, mergeTextResultsVersions, type SearchHit } from "~/lib/search/text-search";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { NavPage } from "~/ui/NavPage/NavPage";
import { EntityResults, ExactToggle, MobileFilterButton, MobileFilterPanel, NoResults, PanelSection, SearchError, SearchSkeleton, SearchBar, SearchFilters, SearchResultCard, SearchTabs, SortMenu, SortRadios } from "~/ui/SearchPage/SearchPage";
import { toRouterLocation } from "../shared/RouterLink";

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
 */
export function SearchRoute() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const params = useMemo(() => parseSearchParams(raw), [raw]);
  const router = useRouter();
  const go = (next: Partial<SearchParams>) => void router.navigate(toRouterLocation(searchHref({ ...params, ...next })) as never);
  const hasQuery = params.q.trim() !== "";
  // The phone layout below 985px wide (the old page's own switch), found after hydration; its panel closes with a tab change
  const mobile = useMediaQuery("(max-width: 985px)");
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => setPanelOpen(false), [params.tab]);

  const catalog = useQuery(tocQueryOptions()).data;
  const order = useMemo(() => (catalog ? catalogOrder(catalog.tree) : new Map<string, number>()), [catalog]);
  const names = useMemo(() => (catalog ? hebrewCategoryNames(catalog.tree) : new Map<string, string>()), [catalog]);

  const sources = useInfiniteQuery({ ...searchResultsQueryOptions(params), enabled: hasQuery });
  const treeQ = useQuery({ ...searchTreeQueryOptions(params), enabled: hasQuery });
  const entityCounts = useQueries({ queries: (["book", "author", "topic"] as EntityType[]).map((t) => ({ ...entitySearchQueryOptions(params.q, t), enabled: hasQuery })) });
  const entityType = ENTITY_TABS[params.tab];
  // Sorting and the Books category filter live in the page, not the address (VERIFIED on sefaria.org: the URL does not change)
  const [entitySort, setEntitySort] = useState<Record<EntityType, EntitySort>>({ book: "relevance", author: "relevance", topic: "relevance" });
  const [bookFilters, setBookFilters] = useState<string[]>([]);
  useEffect(() => { setEntitySort({ book: "relevance", author: "relevance", topic: "relevance" }); setBookFilters([]); }, [params.q]);
  const topicParents = useQuery({ ...topicTocQueryOptions(), enabled: entityType === "author" || entityType === "topic" }).data;
  const entities = useInfiniteQuery({ ...entitySearchInfiniteOptions(params.q, entityType ?? "book", entityType ? entitySort[entityType] : "relevance", entityType === "book" ? bookFilters : []), enabled: hasQuery && !!entityType });
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

  const onToggle = (node: FilterNode) => go({ filters: toggleFilter(node, params.filters, tree) });
  const onToggleBook = (node: FilterNode) => setBookFilters((cur) => toggleFilter(node, cur, bookTree));

  let body;
  if (!hasQuery) body = null;
  else if (entityType) {
    const list = entities.data?.pages.flatMap((p) => p.hits);
    body = entities.isError && !list ? <SearchError onRetry={() => void entities.refetch()} /> : !list ? <p role="status" style={{ textAlign: "center" }}><InterfaceText en="Searching..." he="מבצע חיפוש..." /></p> : <EntityResults type={entityType} hits={list} topicParents={topicParents} empty={<NoResults tab={params.tab} query={params.q} />} />;
  } else if (sources.isError && !hits) body = <SearchError onRetry={() => void sources.refetch()} />;
  else if (!hits) body = null; // the skeleton below stands in while the first query runs
  else if (!hits.length) body = <NoResults tab="sources" query={params.q} />;
  else
    body = (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 20 }} aria-label="Search results">
        {hits.map((h) => (
          <li key={h._id}><SearchResultCard hit={h} hrefFor={hitHref} onOpen={openHit} /></li>
        ))}
      </ul>
    );

  const skeleton = hasQuery && params.tab === "sources" && !hits && !sources.isError;
  return (
    <NavPage
      top={{ main: 64, side: 142 }}
      sidebar={
        mobile ? undefined
        : params.tab === "sources" && hasQuery && tree.length ? <SearchFilters tree={tree} applied={params.filters} onToggle={onToggle} />
        : params.tab === "books" && hasQuery && bookTree.length ? <SearchFilters tree={bookTree} applied={bookFilters} onToggle={onToggleBook} />
        : undefined
      }
    >
      <SearchBar query={params.q} onSubmit={(q) => go({ q, filters: [] })} />
      {skeleton ? <SearchSkeleton /> : hasQuery ? (
        <>
          <SearchTabs mobile={mobile} active={params.tab} counts={counts} hrefFor={(t) => searchHref({ ...params, tab: t })} onTab={(t) => go({ tab: t })} />
          {mobile ? (
            <MobileFilterButton onClick={() => setPanelOpen(true)} />
          ) : params.tab === "sources" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBlockEnd: 18 }}>
              <ExactToggle exact={params.exact} onChange={(exact) => go({ exact })} />
              <SortMenu sort={params.sort} onChange={(sort) => go({ sort })} disabled={first?.total === 0} />
            </div>
          ) : entityType ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBlockEnd: 18 }}>
              <SortMenu sort={entitySort[entityType]} options={ENTITY_SORTS[entityType]} onChange={(v) => setEntitySort((cur) => ({ ...cur, [entityType]: v }))} disabled={entities.data?.pages[0]?.hits.length === 0} />
            </div>
          ) : null}
          {mobile && panelOpen ? (
            <MobileFilterPanel title={<InterfaceText en={params.tab === "sources" ? "Filters" : params.tab === "books" ? "Filter" : "Sort"} he={params.tab === "sources" ? "פילטרים" : params.tab === "books" ? "סינון" : "מיון"} />} onClose={() => setPanelOpen(false)}>
              {params.tab === "sources" ? (
                <>
                  <PanelSection title={<InterfaceText en="Search Type" he="סוג חיפוש" />}><ExactToggle block exact={params.exact} onChange={(exact) => go({ exact })} /></PanelSection>
                  <PanelSection title={<InterfaceText en="Sort by" he="מיון לפי" />}><SortRadios name="sort" value={params.sort} options={SOURCE_SORTS} onChange={(sort) => go({ sort })} /></PanelSection>
                  {tree.length ? <PanelSection title={<InterfaceText en="Filters" he="סינונים" />}><SearchFilters tree={tree} applied={params.filters} onToggle={onToggle} /></PanelSection> : null}
                </>
              ) : (
                <>
                  {entityType ? <PanelSection title={<InterfaceText en="Sort by" he="מיון לפי" />}><SortRadios name="esort" value={entitySort[entityType]} options={ENTITY_SORTS[entityType]} onChange={(v) => setEntitySort((cur) => ({ ...cur, [entityType]: v }))} /></PanelSection> : null}
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
