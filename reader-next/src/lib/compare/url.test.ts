// @feature LEG-010 @feature RTE-019
import { describe, expect, it } from "vitest";
import { comparePath, isComparePath, parseComparePath } from "./url";

describe("parseComparePath (Django's pattern, VERIFIED 2026-11-04 against www.sefaria.org JSON_PROPS)", () => {
  it("reads every part", () => {
    expect(parseComparePath("/compare/Genesis.1/he/Miqra_according_to_the_Masorah/Tanach_with_Ta'amei_Hamikra")).toEqual({ compRef: "Genesis.1", lang: "he", v1: "Miqra according to the Masorah", v2: "Tanach with Ta'amei Hamikra" });
  });
  it("an empty address, with or without the slash", () => {
    expect(parseComparePath("/compare")).toEqual({ compRef: null, lang: null, v1: null, v2: null });
    expect(parseComparePath("/compare/")).toEqual({ compRef: null, lang: null, v1: null, v2: null });
  });
  it("keeps the quirks: a part before the last needs its slash", () => {
    // live: /compare/Genesis.1 → v2 "Genesis.1", an empty form
    expect(parseComparePath("/compare/Genesis.1")).toEqual({ compRef: null, lang: null, v1: null, v2: "Genesis.1" });
    expect(parseComparePath("/compare/Genesis.1/")).toEqual({ compRef: "Genesis.1", lang: null, v1: null, v2: null });
    expect(parseComparePath("/compare/Nonsense_Book/he")).toEqual({ compRef: "Nonsense_Book", lang: null, v1: null, v2: "he" });
    expect(parseComparePath("/compare/Genesis.1/he/Only_One")).toEqual({ compRef: "Genesis.1", lang: "he", v1: null, v2: "Only One" });
  });
  it("decodes the path first, as Django's path_info is (an escaped slash splits)", () => {
    expect(parseComparePath("/compare/Genesis.1/en/A%20B/C%27D")).toEqual({ compRef: "Genesis.1", lang: "en", v1: "A B", v2: "C'D" });
    expect(parseComparePath("/compare/Genesis.1/en/A%2FB/C")).toBeNull();
  });
  it("a path the pattern cannot match is null (a 404)", () => {
    expect(parseComparePath("/compare/Genesis_2//")).toBeNull();
    expect(parseComparePath("/compare/a/b/c/d/e")).toBeNull();
  });
});

describe("comparePath (PageLoader.componentDidUpdate)", () => {
  it("joins the parts and turns spaces into underscores", () => {
    expect(comparePath({ secRef: "Genesis 2", lang: "he", v1: "Miqra according to the Masorah", v2: "Tanach with Nikkud" })).toBe("/compare/Genesis_2/he/Miqra_according_to_the_Masorah/Tanach_with_Nikkud");
  });
  it("collapses what an empty part leaves, as the old page (even when Django then cannot match it)", () => {
    expect(comparePath({ secRef: "Genesis 1", lang: "he", v1: "", v2: "" })).toBe("/compare/Genesis_1/he/");
    expect(comparePath({ secRef: "Genesis 2", lang: null, v1: null, v2: null })).toBe("/compare/Genesis_2//");
    expect(comparePath({ secRef: "", lang: "he", v1: "a", v2: "b" })).toBe("/compare/he/a/b");
  });
  it("round-trips a full address", () => {
    const a = parseComparePath(comparePath({ secRef: "Rashi on Genesis 1:1", lang: "en", v1: "X Y", v2: "Z" }))!;
    expect(a).toEqual({ compRef: "Rashi_on_Genesis_1:1", lang: "en", v1: "X Y", v2: "Z" });
  });
  it("isComparePath is the first segment exactly", () => {
    expect(isComparePath("/compare")).toBe(true);
    expect(isComparePath("/compare/Genesis.1/")).toBe(true);
    expect(isComparePath("/compareX")).toBe(false);
  });
});
