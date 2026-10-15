/**
 * The search page's GA4 funnel — a port of static/js/sefaria/searchAnalytics.js (spec sc-46034), same events, fields and rules:
 *   search_flow_started    {flow_id, source: nav_bar | back_click | deep_link | unknown}
 *   search_query_executed  {flow_id, search_id, search_text, status, result_counts JSON {sources,books,authors,topics}, error, tab}
 *                          — once all four APIs have reported for the current search_id (only the first report per API counts)
 *   search_element_clicked {flow_id, search_id, element_type tab|filter|sort|toggle|result, element_value, tab (live), count,
 *                          result_position}
 *   search_flow_ended      {flow_id, search_id, reason: clicked_result | abandoned} — once
 * Every event carries transport_type "beacon" and drops undefined fields. Everything no-ops without an active flow.
 * Also the old Track event per query: "Search" / "Query: text" / "<q>[ - <filters>]" / total (SRC-108).
 *
 * @feature SRC-104 GA4 search funnel events
 * @feature SRC-105 Search flow lifecycle tracking
 * @feature SRC-106 Search result click analytics
 * @feature SRC-108 Legacy search event tracking
 */
import { gtagEvent, uaEvent, type AnalyticsParams } from "./core";

const QUERY_APIS = ["sources", "books", "authors", "topics"] as const;
export type SearchApi = (typeof QUERY_APIS)[number];
const TAB_LABELS: Record<string, string> = { sources: "Sources", books: "Books", authors: "Authors", topics: "Topics" };
export const tabLabel = (tab: string) => TAB_LABELS[tab] ?? tab;

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** How the first flow of this document is labelled: a back/forward navigation that rebuilt the page, or a direct arrival. */
export const initialFlowSource = (): string => {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return "deep_link";
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "back_forward" ? "back_click" : "deep_link";
};

interface Query {
  searchId: string;
  searchText: string;
  tab: string | null;
  pending: Set<string>;
  counts: Record<string, number | null>;
  error: string | null;
  fired: boolean;
}

const fire = (name: string, fields: AnalyticsParams) => gtagEvent(name, { transport_type: "beacon", ...fields });

class SearchFlow {
  private flow: { flowId: string } | null = null;
  private query: Query | null = null;
  private currentTab: string | null = null;
  private nextSource: string | null = typeof window === "undefined" ? null : initialFlowSource();

  setCurrentTab(tab: string) {
    this.currentTab = tabLabel(tab);
  }
  setNextFlowSource(source: string) {
    this.nextSource = source;
  }
  isFlowActive() {
    return !!this.flow;
  }
  startFlow() {
    const source = this.nextSource || "unknown";
    this.nextSource = null;
    this.flow = { flowId: uuid() };
    this.query = null;
    fire("search_flow_started", { flow_id: this.flow.flowId, source });
  }
  /** A query with new text; `tabOverride` names the tab its results will show in when that is not yet the current tab. */
  startQuery(searchText: string, tabOverride?: string) {
    if (!this.flow) return;
    this.query = { searchId: uuid(), searchText, tab: tabOverride === undefined ? this.currentTab : tabLabel(tabOverride), pending: new Set(QUERY_APIS), counts: {}, error: null, fired: false };
  }
  /** One API answered for the current query (a count, or an error message). */
  recordApiResult(api: SearchApi, count: number | null, errorMessage?: string) {
    const q = this.query;
    if (!this.flow || !q || q.fired || !q.pending.has(api)) return;
    q.pending.delete(api);
    if (errorMessage) {
      q.counts[api] = null;
      if (!q.error) q.error = `${api}: ${errorMessage}`;
    } else q.counts[api] = count;
    if (q.pending.size === 0) {
      q.fired = true;
      fire("search_query_executed", {
        flow_id: this.flow.flowId, search_id: q.searchId, search_text: q.searchText, status: q.error ? "failure" : "success",
        result_counts: JSON.stringify(q.counts), error: q.error ?? undefined, tab: q.tab ?? undefined,
      });
    }
  }
  elementClicked({ elementType, elementValue, count, resultPosition }: { elementType: "tab" | "filter" | "sort" | "toggle" | "result"; elementValue: string; count?: number | null; resultPosition?: number }) {
    if (!this.flow) return;
    fire("search_element_clicked", {
      flow_id: this.flow.flowId, search_id: this.query?.searchId, element_type: elementType, element_value: elementValue,
      tab: this.currentTab ?? undefined, count: count ?? undefined, result_position: resultPosition || undefined,
    });
  }
  /** A click on a result or a link inside it; it ends the flow when it navigates this window (not a new tab). */
  resultClicked(elementValue: string, resultPosition: number, endsFlow = true) {
    if (!this.flow) return;
    this.elementClicked({ elementType: "result", elementValue, resultPosition });
    if (endsFlow) this.endFlow("clicked_result");
  }
  endFlow(reason: "clicked_result" | "abandoned") {
    if (!this.flow) return;
    fire("search_flow_ended", { flow_id: this.flow.flowId, search_id: this.query?.searchId, reason });
    this.flow = null;
    this.query = null;
  }
  /** The old ElasticSearchQuerier's Track event for each sources query (first page). */
  sourcesQuery(query: string, filters: readonly string[], total: number) {
    uaEvent("Search", "Query: text", filters.length ? `${query} - ${filters.join("|")}` : query, total);
  }
  /** For tests. */
  reset() {
    this.flow = null;
    this.query = null;
    this.currentTab = null;
    this.nextSource = null;
  }
}

export const searchFlow = new SearchFlow();
