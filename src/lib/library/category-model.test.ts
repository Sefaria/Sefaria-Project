import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import type { TocNode } from "~/lib/catalog/toc";
import { descriptionPlacement, hebrewCategoryNames, hebrewContentSort, pageTitle, renderedTextTitle, subCategoryToggle, tocItemsByCategories, tocObjectByCategories, withDefaultCorpus } from "./category-model";

const tree = readFixture<TocNode[]>("_toc/toc.json");
const names = hebrewCategoryNames(tree);
const he = (c: string) => names.get(c) ?? c;
const titles = (nodes: TocNode[]) => nodes.map((n) => ("category" in n ? n.category : n.title));

// @feature LIB-008 @feature LIB-009 @feature LIB-010 @feature LIB-011 @feature LIB-014 @feature LIB-015 @feature LIB-016
describe("category page model (real catalog)", () => {
  it("the library home lists the top categories in library order", () => {
    expect(titles(tocItemsByCategories(tree, [])).slice(0, 5)).toEqual(["Tanakh", "Mishnah", "Talmud", "Midrash", "Halakhah"]);
  });
  it("Torah lists the five books; their short descriptions are carried", () => {
    const books = tocItemsByCategories(tree, ["Tanakh", "Torah"]);
    expect(titles(books)).toEqual(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]);
    expect((books[0] as { enShortDesc?: string }).enShortDesc).toMatch(/Creation, the beginning of mankind/);
    expect(tocObjectByCategories(tree, ["Tanakh", "Torah"])?.enDesc).toBe("Five Books of Moses");
    expect(tocObjectByCategories(tree, ["Tanakh", "Nope"])).toBeUndefined();
  });
  it("Talmud and Tosefta alone default to the Bavli and the Vilna edition, with a toggle", () => {
    expect(withDefaultCorpus(["Talmud"])).toEqual(["Talmud", "Bavli"]);
    expect(withDefaultCorpus(["Tosefta"])).toEqual(["Tosefta", "Vilna Edition"]);
    expect(withDefaultCorpus(["Tanakh"])).toEqual(["Tanakh"]);
    const t = subCategoryToggle(["Talmud", "Bavli"])!;
    expect(t.map((x) => [x.label.en, x.active, x.path.join("/")])).toEqual([["Babylonian", true, "Talmud/Bavli"], ["Jerusalem", false, "Talmud/Yerushalmi"]]);
    expect(subCategoryToggle(["Talmud", "Bavli", "Seder Zeraim"])).toBeUndefined();
    expect(subCategoryToggle(["Tanakh", "Torah"])).toBeUndefined();
  });
  it("titles: Talmud depth two is just Talmud; Commentary is '<parent> Commentary'", () => {
    expect(pageTitle(["Talmud", "Bavli"], "Bavli", he)).toEqual({ en: "Talmud", he: he("Talmud") });
    expect(pageTitle(["Tanakh", "Commentary"], "Commentary", he).en).toBe("Tanakh Commentary");
    expect(pageTitle(["Tanakh", "Torah"], "Torah", he)).toEqual({ en: "Torah", he: 'תורה' });
  });
  it("text titles lose the category's name in front, and the Lieberman suffix", () => {
    expect(renderedTextTitle("Rashi on Genesis", "רש\"י על בראשית", ["Tanakh", "Rashi"], he)).toEqual({ en: "Genesis", he: "בראשית" });
    expect(renderedTextTitle("Jerusalem Talmud Berakhot", "תלמוד ירושלמי ברכות", ["Talmud", "Yerushalmi"], he).en).toBe("Berakhot");
    expect(renderedTextTitle("Tosefta Berakhot (Lieberman)", "", ["Tosefta", "Lieberman Edition"], he).en).toBe("Berakhot");
    expect(renderedTextTitle("Pesach Haggadah", "הגדה", ["Liturgy"], he).en).toBe("Pesach Haggadah Ashkenaz");
    expect(renderedTextTitle("Midrash Tanchuma", "מדרש תנחומא", ["Midrash"], he).en).toBe("Midrash Tanchuma");
    expect(renderedTextTitle("Torah", "תורה", ["Tanakh", "Torah"], he).en).toBe("Torah");
  });
  it("Hebrew order: explicit order first (positive), then none, negative last; else Hebrew alphabet", () => {
    const mk = (title: string, heTitle: string, order?: number) => ({ title, heTitle, categories: [], ...(order !== undefined ? { order } : {}) }) as TocNode;
    const sorted = hebrewContentSort([mk("A", "ב"), mk("B", "א"), mk("C", "ג", 1), mk("D", "ד", -1)]);
    expect(titles(sorted)).toEqual(["C", "B", "A", "D"]);
  });
  it("a short description of five words or fewer goes in the heading, a longer one under it", () => {
    expect(descriptionPlacement("The Five Books of Moses")).toEqual({ inline: "(The Five Books of Moses)" });
    expect(descriptionPlacement("one two three four five six")).toEqual({ long: "one two three four five six" });
    expect(descriptionPlacement(undefined)).toEqual({});
  });
});
