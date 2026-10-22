// @feature SRC-104 @feature SRC-105 @feature SRC-106 @feature SRC-108
import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsLog } from "./core";
import { searchFlow } from "./search-flow";

const ev = (name: string) => analyticsLog.filter((e) => e.name === name).map((e) => e.params!);

beforeEach(() => {
  analyticsLog.length = 0;
  searchFlow.reset();
  window.gtag = vi.fn();
});

describe("search funnel (searchAnalytics.js)", () => {
  it("flow, query executed once all four APIs answer, with counts JSON, the tab snapshotted at query start, beacon transport", () => {
    searchFlow.setNextFlowSource("nav_bar");
    searchFlow.setCurrentTab("sources");
    searchFlow.startFlow();
    searchFlow.startQuery("light");
    searchFlow.setCurrentTab("books");
    searchFlow.recordApiResult("sources", 1200);
    searchFlow.recordApiResult("sources", 9); // a re-run (filter) is ignored
    searchFlow.recordApiResult("books", 1);
    searchFlow.recordApiResult("authors", 1);
    expect(ev("search_query_executed")).toEqual([]);
    searchFlow.recordApiResult("topics", 21);
    const [started] = ev("search_flow_started");
    expect(started).toMatchObject({ transport_type: "beacon", source: "nav_bar" });
    const [q] = ev("search_query_executed");
    expect(q).toMatchObject({ flow_id: started!.flow_id, search_text: "light", status: "success", tab: "Sources", result_counts: JSON.stringify({ sources: 1200, books: 1, authors: 1, topics: 21 }) });
    expect(q).not.toHaveProperty("error");
  });
  it("a failing API makes the query a failure with the first error, prefixed", () => {
    searchFlow.startFlow();
    searchFlow.startQuery("x");
    searchFlow.recordApiResult("books", null, "HTTP 500");
    for (const a of ["sources", "authors", "topics"] as const) searchFlow.recordApiResult(a, 0);
    expect(ev("search_query_executed")[0]).toMatchObject({ status: "failure", error: "books: HTTP 500" });
  });
  it("tab clicks carry the tab being left; a plain result click ends the flow, a new-tab click does not; ending happens once", () => {
    searchFlow.setCurrentTab("sources");
    searchFlow.startFlow();
    searchFlow.startQuery("x");
    searchFlow.elementClicked({ elementType: "tab", elementValue: "Books", count: 10 });
    expect(ev("search_element_clicked")[0]).toMatchObject({ element_type: "tab", element_value: "Books", tab: "Sources", count: 10 });
    searchFlow.resultClicked("Genesis 1:1", 3, false);
    expect(ev("search_flow_ended")).toEqual([]);
    searchFlow.resultClicked("Genesis 1:1", 3, true);
    searchFlow.endFlow("abandoned");
    expect(ev("search_flow_ended")).toEqual([expect.objectContaining({ reason: "clicked_result" })]);
    expect(ev("search_element_clicked").at(-1)).toMatchObject({ element_type: "result", element_value: "Genesis 1:1", result_position: 3 });
  });
  it("nothing without a flow; the old Track event per sources query", () => {
    searchFlow.elementClicked({ elementType: "sort", elementValue: "Chronological" });
    expect(analyticsLog).toEqual([]);
    searchFlow.sourcesQuery("light", ["Tanakh"], 120);
    expect(analyticsLog).toEqual([{ channel: "ua", name: "Search|Query: text", params: { label: "light - Tanakh", value: 120 } }]);
  });
});
