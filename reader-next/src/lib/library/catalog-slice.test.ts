import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { isCategory, type TocCategory, type TocNode } from "~/lib/catalog/toc";
import { catalogSlice, hebrewCategoryNames, tocItemsByCategories, tocObjectByCategories } from "./category-model";

const tree = readFixture<TocNode[]>("_toc/toc.json");
const size = (x: unknown) => JSON.stringify(x).length;

// CODE_REVIEW R-14: every /texts page carried the whole catalog (3.5 MB) in its HTML
describe("catalogSlice", () => {
  it("the home page: the top-level categories only, a small fraction of the catalog", () => {
    const s = catalogSlice(tree, []);
    expect(s.map((c) => (c as TocCategory).category)).toEqual(tree.filter(isCategory).map((c) => c.category));
    expect(s.every((c) => isCategory(c) && (c.contents ?? []).length === 0 && c.enShortDesc !== undefined)).toBe(true);
    expect(size(s)).toBeLessThan(size(tree) / 50);
  });
  it("a category page: its own category in full (the list the page shows is unchanged), the path's About and names", () => {
    for (const path of [["Tanakh"], ["Tanakh", "Torah"], ["Talmud"], ["Halakhah"]]) {
      const s = catalogSlice(tree, path);
      const cats = path[0] === "Talmud" ? ["Talmud", "Bavli"] : path;
      const titles = (nodes: readonly TocNode[]) => nodes.map((n) => (isCategory(n) ? n.category : n.title));
      expect(titles(tocItemsByCategories(s, cats))).toEqual(titles(tocItemsByCategories(tree, cats)));
      expect(tocObjectByCategories(s, [path[0]!])?.enDesc).toBe(tocObjectByCategories(tree, [path[0]!])?.enDesc);
      for (const c of cats) expect(hebrewCategoryNames(s).get(c)).toBe(hebrewCategoryNames(tree).get(c));
      expect(size(s)).toBeLessThan(size(tree) / 2);
    }
  });
});
