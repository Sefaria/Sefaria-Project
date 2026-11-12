// @feature TOP-013 @feature TOP-003 @feature TOP-031
import { describe, expect, it } from "vitest";
import { fetchNumLibraryTopics, fetchTopicTocTree, numLibraryTopicsFromHtml, topicTocFromDataJs } from "./toc-source";
import { topicTocCategoryPaths, topicTocPage, type TopicTocNode } from "./topic-toc";

const TOC: TopicTocNode[] = [
  {
    slug: "jewish-calendar2",
    primaryTitle: { en: "Jewish Calendar", he: "מועדי השנה" },
    shouldDisplay: true,
    displayOrder: 0,
    pools: ["sheets"],
    categoryDescription: { en: "Festivals", he: "חגים" },
    children: [
      { slug: "shabbat", primaryTitle: { en: "Shabbat", he: "שבת" }, shouldDisplay: true, displayOrder: 0, pools: ["library"], description: { en: "Rest]{", he: "" } },
      { slug: "fasts", primaryTitle: { en: "Fasts", he: "צומות" }, children: [{ slug: "yom-kippur", primaryTitle: { en: "Yom Kippur", he: "יום כיפור" } }] },
    ],
  },
  { slug: "prayer", primaryTitle: { en: "Prayer", he: "תפילה" }, children: [] },
];

const DATA_JS = `//all vars in this file will be available in global js scope

var DJANGO_DATA_VARS = {
  _dataLoaded:          true,
  toc:                  [{"category": "Tanakh", "contents": []}],
  topic_toc:            ${JSON.stringify(TOC)},
  terms:                {"a": "[not the toc]"},
};`;

const res = (body: string, status = 200) => new Response(body, { status });

describe("the topics TOC source", () => {
  it("reads topic_toc out of the old data.js (brackets inside strings included)", () => {
    expect(topicTocFromDataJs(DATA_JS)).toEqual(TOC);
    expect(() => topicTocFromDataJs("var X = {};")).toThrow();
  });
  it("uses /api/topics-toc where it exists", async () => {
    const calls: string[] = [];
    const tree = await fetchTopicTocTree("https://x", async (u) => (calls.push(String(u)), res(JSON.stringify(TOC))));
    expect(tree).toEqual(TOC);
    expect(calls).toEqual(["https://x/api/topics-toc"]);
  });
  it("falls back to data.js when the endpoint is missing (sefaria.org: 404), and only then", async () => {
    const calls: string[] = [];
    const tree = await fetchTopicTocTree("https://x", async (u) => (calls.push(String(u)), String(u).endsWith("/api/topics-toc") ? res("nope", 404) : res(DATA_JS)));
    expect(tree).toEqual(TOC);
    expect(calls).toEqual(["https://x/api/topics-toc", "https://x/data.js"]);
    await expect(fetchTopicTocTree("https://x", async () => res("down", 500))).rejects.toThrow(/500/);
  });
  it("the library count: the API, else the old page's props, else none", async () => {
    expect(await fetchNumLibraryTopics("https://x", async () => res(JSON.stringify({ count: 5768 })))).toBe(5768);
    expect(await fetchNumLibraryTopics("https://x", async (u) => (String(u).endsWith("/topics") ? res('{"props": {"numLibraryTopics": 5768, "x": 1}}') : res("", 404)))).toBe(5768);
    expect(await fetchNumLibraryTopics("https://x", async () => res("", 404))).toBeNull();
    expect(numLibraryTopicsFromHtml('"numLibraryTopics":12')).toBe(12);
  });
});

describe("pages of the TOC (Sefaria.topicTocPage, topicTocCategories)", () => {
  it("the top level, and a category's children, without their own children", () => {
    expect(topicTocPage(TOC)!.map((e) => [e.slug, e.isCategory])).toEqual([["jewish-calendar2", true], ["prayer", true]]);
    const page = topicTocPage(TOC, "jewish-calendar2")!;
    expect(page.map((e) => e.slug)).toEqual(["shabbat", "fasts"]);
    expect(page[1]).toMatchObject({ isCategory: true, shouldDisplay: true, displayOrder: 10000, pools: [] });
    expect(page[1]).not.toHaveProperty("children");
  });
  it("an empty category is still a category; a leaf or an unknown slug has no page", () => {
    expect(topicTocPage(TOC, "prayer")).toEqual([]);
    expect(topicTocPage(TOC, "shabbat")).toBeUndefined();
    expect(topicTocPage(TOC, "nope")).toBeUndefined();
  });
  it("every topic's path of categories, outermost first", () => {
    const p = topicTocCategoryPaths(TOC);
    expect(p["yom-kippur"]!.map((c) => c.slug)).toEqual(["jewish-calendar2", "fasts"]);
    expect(p["jewish-calendar2"]).toEqual([]);
  });
});
