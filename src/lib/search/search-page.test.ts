import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import type { TocNode } from "~/lib/catalog/toc";
import { hebrewCategoryNames } from "~/lib/library/category-model";
import { authorLifespan, buildBookFilterTree, buildFilterTree, catalogOrder, ENTITY_SORTS, formatYear, countLabel, matchesFilterText, parseSearchParams, searchParamsToQuery, selectionOf, textSearchBody, toggleFilter, type FilterNode, type SearchParams } from "./search-page";

const tree = readFixture<TocNode[]>("_toc/toc.json");
const order = catalogOrder(tree);
const names = hebrewCategoryNames(tree);
const buckets = readFixture<{ aggregations: { path: { buckets: { key: string; doc_count: number }[] } } }>("search/agg-light.json").aggregations.path.buckets;
const base: SearchParams = { q: "light", tab: "sources", sort: "relevance", exact: false, filters: [] };

// @feature SRC-040 @feature SRC-045 @feature SRC-044
describe("search URL", () => {
  it("reads the old site's parameters", () => {
    expect(parseSearchParams({ q: "light", tab: "text", search_tab: "books", tvar: "0", tsort: "chronological", tpathFilters: "Tanakh|Talmud/Bavli/Berakhot" })).toEqual({
      q: "light", tab: "books", exact: true, sort: "chronological", filters: ["Tanakh", "Talmud/Bavli/Berakhot"],
    });
    expect(parseSearchParams({ q: "x" })).toEqual({ q: "x", tab: "sources", exact: false, sort: "relevance", filters: [] });
    expect(parseSearchParams({ q: "x", search_tab: "nonsense" }).tab).toBe("sources");
  });
  it("writes them the same way", () => {
    expect(searchParamsToQuery(base)).toEqual({ q: "light", tab: "text", search_tab: "sources", tvar: "1", tsort: "relevance" });
    expect(searchParamsToQuery({ ...base, exact: true, filters: ["Tanakh", "Mishnah"] })).toMatchObject({ tvar: "0", tpathFilters: "Tanakh|Mishnah" });
  });
});

// @feature SRC-079 @feature SRC-080
describe("the request (VERIFIED against the live page's request)", () => {
  it("all results, relevance", () => {
    expect(textSearchBody(base, { aggs: true })).toEqual({
      aggs: ["path"], field: "naive_lemmatizer", filter_fields: [], filters: [], query: "light", size: 100, slop: 10,
      sort_fields: ["pagesheetrank"], sort_method: "score", sort_reverse: false, sort_score_missing: 0.04, source_proj: true, type: "text",
    });
  });
  it("exact phrase has no slop and the exact field; chronological sorts by date; filters name their field; paging starts after the loaded hits", () => {
    const b = textSearchBody({ ...base, exact: true, sort: "chronological", filters: ["Tanakh"] }, { start: 100 });
    expect(b).toMatchObject({ field: "exact", slop: 0, sort_fields: ["comp_date", "order"], sort_method: "sort", filters: ["Tanakh"], filter_fields: ["path"], start: 100 });
  });
  it("a quote inside a Hebrew word is the gershayim", () => {
    expect(textSearchBody({ ...base, q: 'רמב"ם' }).query).toBe("רמב״ם");
  });
  it("10,000 or more is shown capped", () => {
    expect(countLabel(10000, "gte")).toBe("10,000+");
    expect(countLabel(1234, "eq")).toBe("1,234");
  });
});

// @feature SRC-083 @feature SRC-084 @feature SRC-085
describe("the filter tree", () => {
  const filterTree = buildFilterTree(buckets, [], order, (c) => names.get(c) ?? c);
  it("top categories in library order, counts summed from their books", () => {
    expect(filterTree.slice(0, 4).map((n) => n.title)).toEqual(["Tanakh", "Mishnah", "Talmud", "Midrash"]);
    const tanakh = filterTree[0]!;
    expect(tanakh.count).toBe(tanakh.children.reduce((n, c) => n + c.count, 0));
    expect(tanakh.heTitle).toBe('תנ"ך');
  });
  it("books under a category follow the library order", () => {
    const tanakh = filterTree.find((n) => n.title === "Tanakh")!;
    const keys = tanakh.children.map((c) => c.key);
    const idx = (k: string) => order.get(k)!;
    expect([...keys].sort((a, b) => idx(a) - idx(b))).toEqual(keys);
  });
  it("paths the catalog does not know are dropped; applied filters stay even without a bucket", () => {
    const t = buildFilterTree([{ key: "Nonsense/Book", doc_count: 3 }], ["Tanakh/Torah/Genesis"], order, (c) => c);
    expect(t.map((n) => n.key)).toEqual(["Tanakh"]);
    expect(t[0]!.children[0]!.count).toBe(0);
  });
  it("selecting: a category selects its books; one book off makes it partial; all books back make it the category again", () => {
    const tanakh = filterTree.find((n) => n.title === "Tanakh")!;
    let applied = toggleFilter(tanakh, [], filterTree);
    expect(applied).toEqual(["Tanakh"]);
    expect(selectionOf(tanakh, applied)).toBe("selected");
    expect(selectionOf(tanakh.children[0]!, applied)).toBe("selected");
    const first = tanakh.children[0]!;
    applied = toggleFilter(first, applied, filterTree);
    expect(applied).not.toContain("Tanakh");
    expect(selectionOf(tanakh, applied)).toBe("partial");
    expect(selectionOf(first, applied)).toBe("none");
    applied = toggleFilter(first, applied, filterTree);
    expect(applied).toEqual(["Tanakh"]);
  });
  it("clearing a partly selected category clears its books", () => {
    const talmud = filterTree.find((n) => n.title === "Talmud")!;
    const applied = [talmud.children[0]!.key];
    expect(selectionOf(talmud, applied)).toBe("partial");
    expect(toggleFilter(talmud, applied, filterTree)).toEqual([]);
  });
  it("the filter box matches a word starting with the text in the category or a book, or a selected one", () => {
    const node: FilterNode = { key: "Tanakh", title: "Tanakh", heTitle: "תנ״ך", count: 1, children: [{ key: "Tanakh/Torah/Genesis", title: "Genesis", heTitle: "", count: 1, children: [] }] };
    expect(matchesFilterText(node, "gen", [])).toBe(true);
    expect(matchesFilterText(node, "xyz", [])).toBe(false);
    expect(matchesFilterText(node, "xyz", ["Tanakh"])).toBe(true);
    expect(matchesFilterText(node, "", [])).toBe(true);
  });
});

// @feature SRC-068 @feature SRC-069 @feature SRC-071
describe("entity tabs", () => {
  it("years: CE, BCE, a lifespan in one era, across eras, or the one year known", () => {
    expect(formatYear(1590)).toEqual({ en: "1590 CE", he: "1590 לספירה" });
    expect(formatYear(-500)?.en).toBe("500 BCE");
    expect(formatYear(null)).toBeNull();
    expect(authorLifespan({ birthYear: "1135", deathYear: "1204" })?.en).toBe("1135 – 1204 CE");
    expect(authorLifespan({ birthYear: -500, deathYear: 20 })?.en).toBe("500 BCE – 20 CE");
    expect(authorLifespan({ deathYear: 1609 })?.en).toBe("1609 CE");
  });
  it("sorts: topics have two, books and authors four", () => {
    expect(ENTITY_SORTS.topic.map((s) => s.value)).toEqual(["relevance", "alpha"]);
    expect(ENTITY_SORTS.book.map((s) => s.value)).toEqual(["relevance", "year_asc", "year_desc", "alpha"]);
    expect(ENTITY_SORTS.author.map((s) => s.en)).toContain("Year (Oldest First)");
  });
  it("the Books category tree: top and sub categories with the whole match set's counts, empty ones hidden", () => {
    const catalog = [
      { category: "Tanakh", heCategory: "תנ״ך", contents: [{ category: "Torah", heCategory: "תורה", contents: [] }, { category: "Prophets", heCategory: "נביאים", contents: [] }] },
      { category: "Mishnah", heCategory: "משנה", contents: [] },
    ] as never;
    const tree = buildBookFilterTree(catalog, { Tanakh: 5, "Tanakh/Torah": 5 }, []);
    expect(tree.map((n) => [n.key, n.count, n.children.map((c) => c.key)])).toEqual([["Tanakh", 5, ["Tanakh/Torah"]]]);
    expect(buildBookFilterTree(catalog, { Tanakh: 5 }, ["Mishnah"]).map((n) => n.key)).toEqual(["Tanakh", "Mishnah"]);
    expect(buildBookFilterTree(catalog, undefined, [])).toEqual([]);
  });
});

// @feature SRC-083
describe("filter tree order", () => {
  it("the commentaries and Targum come last under their own names (VERIFIED on sefaria.org, 'light')", () => {
    const names = buildFilterTree(buckets, [], order, (c) => c).map((n) => n.title);
    expect(names.slice(-5)).toEqual(["Reference", "Targum", "Tanakh Commentary", "Mishnah Commentary", "Talmud Commentary"]);
    expect(names.slice(0, 3)).toEqual(["Tanakh", "Mishnah", "Talmud"]);
  });
});

// @feature SRC-087
describe("the filter box with Hebrew", () => {
  const node = { key: "Tanakh", title: "Tanakh", heTitle: "תנ״ך", count: 5, children: [{ key: "Tanakh/Torah", title: "Torah", heTitle: "תורה", count: 3, children: [] }] };
  it("matches Hebrew titles, vowels ignored — the old box matched everything", () => {
    expect(matchesFilterText(node, "תנ", [])).toBe(true);
    expect(matchesFilterText(node, "תוֹ", [])).toBe(true); // a child's Hebrew title
    expect(matchesFilterText(node, "משנה", [])).toBe(false);
    expect(matchesFilterText(node, "ta", [])).toBe(true);
    expect(matchesFilterText(node, "zz", [])).toBe(false);
  });
});
