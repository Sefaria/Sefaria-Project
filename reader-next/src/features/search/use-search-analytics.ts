import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { searchFlow, type SearchApi } from "~/lib/analytics";
import type { SearchTab } from "~/lib/search/search-page";

let pendingEnd: ReturnType<typeof setTimeout> | undefined;

interface ApiState {
  total: number | undefined;
  error: unknown;
}

/**
 * The search funnel's lifecycle on the search page (the old ElasticSearchQuerier + SearchPage wiring, SRC-104/105):
 * a flow from mount to unmount (or page hide), a new query per new text, each API's first answer recorded, a new flow
 * with source back_click when the page comes back from the back-forward cache.
 */
export function useSearchFlowAnalytics(q: string, tab: SearchTab, apis: Record<SearchApi, ApiState>, sourcesFirstPage: { total: number; filters: readonly string[]; key: unknown } | undefined) {
  const qRef = useRef(q);
  qRef.current = q;
  // the tab shown is reported before anything else (the old SearchPage.componentDidMount)
  searchFlow.setCurrentTab(tab);

  useEffect(() => {
    // An unmount ends the flow on the next tick, so an immediate remount (React's development StrictMode) keeps it
    if (pendingEnd !== undefined) {
      clearTimeout(pendingEnd);
      pendingEnd = undefined;
    } else {
      searchFlow.startFlow();
      searchFlow.startQuery(qRef.current);
    }
    const onHide = () => searchFlow.endFlow("abandoned");
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      searchFlow.setNextFlowSource("back_click");
      searchFlow.startFlow();
      searchFlow.startQuery(qRef.current);
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      pendingEnd = setTimeout(() => {
        pendingEnd = undefined;
        searchFlow.endFlow("abandoned");
      }, 0);
    };
  }, []);

  // new text: a new search_id (filters and sorts are element clicks, not new queries)
  const lastQ = useRef(q);
  useEffect(() => {
    if (lastQ.current === q) return;
    lastQ.current = q;
    searchFlow.startQuery(q, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useApiResult("sources", apis.sources, q);
  useApiResult("books", apis.books, q);
  useApiResult("authors", apis.authors, q);
  useApiResult("topics", apis.topics, q);

  // the old per-query Track event, once per first page of results
  useEffect(() => {
    if (sourcesFirstPage) searchFlow.sourcesQuery(q, sourcesFirstPage.filters, sourcesFirstPage.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesFirstPage?.key]);
}

/** One API's first answer (or failure) for the current query; later answers are ignored by searchFlow. */
function useApiResult(api: SearchApi, { total, error }: ApiState, q: string) {
  useEffect(() => {
    if (error) searchFlow.recordApiResult(api, null, error instanceof Error ? error.message : String(error));
    else if (total !== undefined) searchFlow.recordApiResult(api, total);
  }, [api, total, error, q]);
}

/**
 * Result clicks (SRC-106): the card and every link in it report as `result` with the 1-based position; the value is the result
 * itself (`value`) for the card, its title and its version rows (links marked data-result-title), a link's own text for a crumb or
 * author. A plain click ends the flow; a modified or
 * middle click opens a new tab and does not.
 */
export function resultClickHandlers(value: string, position: number) {
  const report = (e: ReactMouseEvent, middle: boolean) => {
    const a = (e.target as Element).closest("a");
    const titleLink = a?.matches("[data-result-title]") ?? false;
    const v = a && !titleLink ? (a.textContent ?? "").trim() || value : value;
    const newTab = middle || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    searchFlow.resultClicked(v, position, !newTab);
  };
  return {
    onClickCapture: (e: ReactMouseEvent) => e.button === 0 && report(e, false),
    onAuxClick: (e: ReactMouseEvent) => e.button === 1 && report(e, true),
  };
}
