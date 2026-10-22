import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { buildCatalog, type TocNode } from "~/lib/catalog/toc";
import { dedupeLinks, filterLinks, linkCount, linksForRefs, makeIndexLookup, sortLinks, type RelatedLink } from "./links";
import { categoryView, essaysFor, linkSummary, sortBooks, topLevelSummary, type BookSummary } from "./summary";

const catalog = buildCatalog(readFixture<TocNode[]>("_toc/toc.json"));
// /api/links/<section>?with_text=0: the data the reader loads for connections (fixture is truncated by the recorder).
const links = readFixture<RelatedLink[]>("genesis-1/links.json");
const lookup = makeIndexLookup(catalog, links);

const link = (over: Partial<RelatedLink>): RelatedLink => ({
  _id: "x", index_title: "Rashi on Genesis", category: "Commentary", type: "commentary", ref: "Rashi on Genesis 1:1:1", anchorRef: "Genesis 1:1",
  anchorRefExpanded: ["Genesis 1:1"], sourceRef: "Rashi on Genesis 1:1:1", sourceHeRef: "", anchorVerse: 1, sourceHasEn: true, commentaryNum: 1.0001,
  collectiveTitle: { en: "Rashi", he: "רש״י" }, ...over,
});

// @feature CON-029 @feature CON-071
describe("links", () => {
  it("de-duplicates links reached through several segments", () => {
    const l = link({});
    expect(dedupeLinks([l, { ...l }, link({ sourceRef: "other" })])).toHaveLength(2);
  });

  it("selects the links attached to the chosen segments", () => {
    const v1 = linksForRefs(links, ["Genesis 1:1"]);
    expect(v1.length).toBeGreaterThan(5);
    expect(v1.every((l) => l.anchorRefExpanded.includes("Genesis 1:1"))).toBe(true);
    expect(linksForRefs(links, ["Genesis 99:99"])).toEqual([]);
  });

  it("counts a verse's connections under a filter (the dot beside each verse)", () => {
    const all = linkCount(links, "Genesis 1:1", [], lookup);
    const rashi = linkCount(links, "Genesis 1:1", ["Rashi"], lookup);
    expect(all).toBeGreaterThan(rashi);
    expect(rashi).toBe(3); // Rashi has three comments on the first verse
  });
});

// @feature CON-027
describe("filterLinks", () => {
  const rashi = link({});
  const quoting = link({ _id: "q", category: "Quoting Commentary", type: "", index_title: "Sforno on Genesis", collectiveTitle: { en: "Sforno on Genesis", he: "" } });
  const targum = link({ _id: "t", category: "Targum", type: "targum", index_title: "Targum Jonathan on Genesis", collectiveTitle: { en: "Targum Jonathan on Genesis", he: "" } });
  const essay = link({ _id: "e", category: "Essay", type: "essay", displayedText: { en: "Fox on Genesis", he: "" }, collectiveTitle: { en: "Everett Fox", he: "" } });
  const all = [rashi, quoting, targum, essay];
  const lk = makeIndexLookup(undefined, all);

  it("an empty filter keeps everything", () => expect(filterLinks(all, [], lk)).toHaveLength(4));
  it("a category matches its links", () => expect(filterLinks(all, ["Targum"], lk)).toEqual([targum]));
  it("a commentator matches only Commentary links", () => expect(filterLinks(all, ["Rashi"], lk)).toEqual([rashi]));
  it("`|Quoting` matches only quoting commentary", () => expect(filterLinks(all, ["Sforno on Genesis|Quoting"], lk)).toEqual([quoting]));
  it("`|Essay` matches an essay by its displayed title", () => expect(filterLinks(all, ["Fox on Genesis|Essay"], lk)).toEqual([essay]));
  it("a commentator name never matches a non-commentary link with the same title", () => {
    const sameName = link({ _id: "z", category: "Midrash", collectiveTitle: { en: "Rashi", he: "" } });
    expect(filterLinks([rashi, sameName], ["Rashi"], lk)).toEqual([rashi]);
  });
});

describe("sortLinks", () => {
  it("orders by verse, then commentary number within an index, then source ref", () => {
    const a = link({ _id: "a", anchorVerse: 2, commentaryNum: 1 });
    const b = link({ _id: "b", anchorVerse: 1, commentaryNum: 2.0001 });
    const c = link({ _id: "c", anchorVerse: 1, commentaryNum: 1.0001 });
    const d = link({ _id: "d", anchorVerse: 1, index_title: "Aaa", sourceRef: "Aaa 1", commentaryNum: 0 });
    expect(sortLinks([a, b, c, d], false).map((l) => l._id)).toEqual(["d", "c", "b", "a"]);
  });
});

// @feature CON-019 @feature CON-020 @feature CON-021
describe("linkSummary on real data (Genesis 1)", () => {
  const verse = linksForRefs(links, ["Genesis 1:1"]);
  const summary = linkSummary(verse, { catalog, baseCategory: "Tanakh" });

  it("puts Commentary first", () => expect(summary[0]!.category).toBe("Commentary"));

  it("counts books under their category", () => {
    const commentary = summary.find((c) => c.category === "Commentary")!;
    expect(commentary.count).toBe(commentary.books.reduce((n, b) => n + b.count, 0));
    expect(commentary.books.find((b) => b.book === "Rashi")?.count).toBe(3);
  });

  it("lists the Tanakh top commentators first, then alphabetically", () => {
    const books = summary.find((c) => c.category === "Commentary")!.books.map((b) => b.book);
    expect(books.slice(0, 4)).toEqual(["Rashi", "Ibn Ezra", "Ramban", "Sforno"].filter((b) => books.includes(b)));
    const rest = books.filter((b) => !["Rashi", "Ibn Ezra", "Ramban", "Sforno"].includes(b));
    expect([...rest].sort()).toEqual(rest);
  });

  it("excludes essay links from the counts", () => {
    expect(summary.find((c) => c.category === "Essay")).toBeUndefined();
  });

  it("gives books their Hebrew title", () => {
    expect(summary.find((c) => c.category === "Commentary")!.books.find((b) => b.book === "Rashi")!.heBook).toBe("רש\"י");
  });

  it("places Targum right after Commentary and Tanakh-related categories", () => {
    const names = summary.map((c) => c.category);
    expect(names.indexOf("Targum")).toBeGreaterThan(names.indexOf("Commentary"));
  });

  it("promotes the categories the base text's category prefers", () => {
    const fake = [
      link({ _id: "1", sourceRef: "a", category: "Midrash", collectiveTitle: { en: "Bereshit Rabbah", he: "" } }),
      link({ _id: "2", sourceRef: "b", category: "Chasidut", collectiveTitle: { en: "X", he: "" } }),
      link({ _id: "3", sourceRef: "c", category: "Halakhah", collectiveTitle: { en: "Y", he: "" } }),
    ];
    const names = linkSummary(fake, { catalog, baseCategory: "Tanakh" }).map((c) => c.category);
    expect(names.indexOf("Midrash")).toBeLessThan(names.indexOf("Chasidut"));
    expect(names.indexOf("Halakhah")).toBeLessThan(names.indexOf("Chasidut"));
  });

  it("lists every commentator in the section, with zero counts, when the selection is narrower", () => {
    const onVerse1 = link({ _id: "r", sourceRef: "r1", anchorRefExpanded: ["Genesis 1:1"] });
    const onVerse2 = link({ _id: "i", sourceRef: "i1", index_title: "Ibn Ezra on Genesis", anchorRefExpanded: ["Genesis 1:2"], collectiveTitle: { en: "Ibn Ezra", he: "אבן עזרא" } });
    const section = [onVerse1, onVerse2];
    const s = linkSummary(linksForRefs(section, ["Genesis 1:1"]), { catalog, baseCategory: "Tanakh", sectionLinks: section, narrowerThanSection: true });
    const books = s.find((c) => c.category === "Commentary")!.books;
    expect(books.map((b) => [b.book, b.count])).toEqual([["Rashi", 1], ["Ibn Ezra", 0]]);
    // and not when the selection is the whole section
    const whole = linkSummary(section, { catalog, baseCategory: "Tanakh", sectionLinks: section, narrowerThanSection: false });
    expect(whole.find((c) => c.category === "Commentary")!.books.map((b) => b.count)).toEqual([1, 1]);
  });
});

describe("sortBooks", () => {
  const b = (book: string): BookSummary => ({ book, heBook: book, category: "x", count: 1, hasEnglish: true });
  it("English Mishnah lists the English explanation second", () => {
    const sorted = ["Boaz", "English Explanation of Mishnah", "Bartenura", "Aaa"].map(b).sort(sortBooks("Mishnah", false)).map((x) => x.book);
    expect(sorted).toEqual(["Bartenura", "English Explanation of Mishnah", "Boaz", "Aaa"]);
  });
  it("Hebrew Mishnah does not", () => {
    const sorted = ["Boaz", "English Explanation of Mishnah", "Bartenura"].map(b).sort(sortBooks("Mishnah", true)).map((x) => x.book);
    expect(sorted).toEqual(["Bartenura", "Boaz", "English Explanation of Mishnah"]);
  });
});

// @feature CON-023
describe("topLevelSummary", () => {
  const cat = (category: string, count: number, hasEnglish = false): ReturnType<typeof linkSummary>[number] => ({ category, count, hasEnglish, books: [] });
  it("folds Quoting Commentary into Commentary", () => {
    const t = topLevelSummary([cat("Commentary", 10), cat("Quoting Commentary", 3, true), cat("Talmud", 2)]);
    expect(t.categories.map((c) => c.category)).toEqual(["Commentary", "Talmud"]);
    expect(t.categories[0]).toMatchObject({ count: 13, hasEnglish: true });
  });
  it("creates a Commentary row when only quoting commentary exists", () => {
    const t = topLevelSummary([cat("Quoting Commentary", 2), cat("Talmud", 2)]);
    expect(t.categories[0]).toMatchObject({ category: "Commentary", count: 2 });
  });
  it("shows four rows and reports how many are hidden", () => {
    const t = topLevelSummary(["A", "B", "C", "D", "E", "F"].map((c) => cat(c, 1)));
    expect(t.visible).toHaveLength(4);
    expect(t.hiddenCount).toBe(2);
  });
  it("has no hidden rows when there are four or fewer", () => {
    expect(topLevelSummary([cat("A", 1), cat("B", 1)]).hiddenCount).toBe(0);
  });
});

// @feature CON-025
describe("categoryView", () => {
  const s = [{ category: "Commentary", count: 5, hasEnglish: true, books: [] }, { category: "Quoting Commentary", count: 2, hasEnglish: false, books: [] }, { category: "Talmud", count: 3, hasEnglish: false, books: [] }];
  it("Commentary shows quoting commentary too, commentary first", () => expect(categoryView(s, "Commentary").map((c) => c.category)).toEqual(["Commentary", "Quoting Commentary"]));
  it("other categories show only themselves", () => expect(categoryView(s, "Talmud").map((c) => c.category)).toEqual(["Talmud"]));
  it("an empty category shows a zero placeholder", () => expect(categoryView(s, "Midrash")).toEqual([{ category: "Midrash", count: 0, hasEnglish: false, books: [] }]));
});

// @feature CON-024
describe("essays", () => {
  const essay = (title: string, lang = "en"): RelatedLink => link({ _id: title + lang, category: "Essay", type: "essay", displayedText: { en: title, he: title }, anchorVersion: { language: lang, title: title === "all" ? "ALL" : "Some Version" }, sourceRef: title });
  it("shows an essay for ALL versions or the version on screen", () => {
    expect(essaysFor([essay("all"), essay("matching"), essay("other", "he")], { en: "Some Version" }).map((e) => e.title.en)).toEqual(["all", "matching"]);
  });
  it("hides an essay anchored to a different version", () => {
    expect(essaysFor([essay("matching")], { en: "Another Version" })).toEqual([]);
  });
});
