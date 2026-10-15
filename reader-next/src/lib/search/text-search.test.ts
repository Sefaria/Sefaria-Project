import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { server } from "../../../test/msw/server";
import { fetchTextSearchPage, highlightsOf, mergeTextResultsVersions, searchPathQueryOptions, snippetOf, textQueryBody, textSearchQueryOptions, type SearchHit, type SearchPage } from "./text-search";

const light = readFixture<{ hits: { hits: SearchHit[] } }>("search/genesis-light.json").hits.hits;

// @feature SRC-097
describe("search path of a book", () => {
  it("is what the API returns", async () => {
    expect(await new QueryClient().fetchQuery(searchPathQueryOptions("Genesis"))).toBe("Tanakh/Torah/Genesis");
  });
});

// @feature SRC-094
describe("the query the old sidebar sends", () => {
  it("naive lemmatizer, path filter, chronological, 100 a page", () => {
    expect(textQueryBody("light", "Tanakh/Torah/Genesis")).toEqual({
      aggs: [], field: "naive_lemmatizer", filter_fields: ["path"], filters: ["Tanakh/Torah/Genesis"], query: "light", size: 100, slop: 10,
      sort_fields: ["comp_date", "order"], sort_method: "sort", sort_reverse: false, source_proj: true, type: "text",
    });
    expect(textQueryBody("light", "x", 100)).toMatchObject({ start: 100 });
  });
  it("returns the total and the hits", async () => {
    const page = await fetchTextSearchPage("light", "Tanakh/Torah/Genesis", 0);
    expect(page.total).toBe(112);
    expect(page.hits[0]!._source.ref).toBe("Genesis 1:3");
  });
  it("pages on from the hits already loaded, until the total", async () => {
    const mk = (n: number): SearchPage => ({ total: 5, hits: Array.from({ length: n }, (_, i) => ({ _id: String(i), _source: { ref: `R ${i}` } }) as unknown as SearchHit) });
    const o = textSearchQueryOptions("q", "p");
    expect(o.getNextPageParam!(mk(3), [mk(3)], 0, [0])).toBe(3);
    expect(o.getNextPageParam!(mk(2), [mk(3), mk(2)], 3, [0, 3])).toBeUndefined();
    expect(o.getNextPageParam!(mk(0), [mk(0)], 0, [0])).toBeUndefined();
  });
  it("a server error is an error, not an empty result", async () => {
    server.use(http.post("https://www.sefaria.org/api/search-wrapper/es8", () => HttpResponse.json({}, { status: 500 })));
    await expect(fetchTextSearchPage("x", "p", 0)).rejects.toThrow(/HTTP 500/);
  });
});

// @feature SRC-096
describe("results", () => {
  it("one result per ref, the best version leading, others as duplicates", () => {
    const merged = mergeTextResultsVersions(light);
    const refs = merged.map((h) => h._source.ref);
    expect(new Set(refs).size).toBe(refs.length);
    const first = merged.find((h) => h._source.ref === "Genesis 1:3")!;
    expect(first.duplicates?.length).toBeGreaterThan(0);
    const priorities = [first, ...(first.duplicates ?? [])].map((h) => h._source.version_priority ?? 0);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });
  it("drops hit ids that repeat", () => {
    expect(mergeTextResultsVersions([light[0]!, light[0]!])).toHaveLength(1);
  });
  it("the snippet is the highlighted fragments joined by '...', without leading punctuation", () => {
    const hit = { _id: "1", _source: { ref: "R" }, highlight: { naive_lemmatizer: [". a <b>light</b>", "more <b>light</b>"] } } as unknown as SearchHit;
    expect(snippetOf(hit)).toEqual({ html: "a <b>light</b>...more <b>light</b>", lang: "en" });
  });
  it("Hebrew snippets are marked Hebrew; with no highlight the text itself shows", () => {
    expect(snippetOf({ _id: "1", _source: { ref: "R", exact: "וַיֹּאמֶר" } } as unknown as SearchHit)).toEqual({ html: "וַיֹּאמֶר", lang: "he" });
  });
  it("matched words: consecutive highlights are one phrase, with the punctuation around them (as the old client)", () => {
    const hit = { _id: "1", _source: { ref: "R" }, highlight: { naive_lemmatizer: ["let there be <b>light</b> <b>and</b> darkness, <b>day</b>"] } } as unknown as SearchHit;
    expect(highlightsOf(hit)).toEqual([" light and ", ", day"]);
  });
});
