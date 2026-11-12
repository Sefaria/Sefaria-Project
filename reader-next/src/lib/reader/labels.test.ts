import { describe, expect, it } from "vitest";
import { linkDotOpacity, numberLang, segmentNumber, segmentNumberLang, showsSegmentNumbers, visibleSides } from "./labels";

// @feature TXD-043 @feature TXD-045
describe("visibleSides", () => {
  const both = { primary: true, translation: true };
  it("bilingual shows both", () => expect(visibleSides("bilingual", both)).toEqual({ primary: true, translation: true }));
  it("english hides the primary when a translation exists", () => expect(visibleSides("english", both)).toEqual({ primary: false, translation: true }));
  it("hebrew hides the translation when a primary exists", () => expect(visibleSides("hebrew", both)).toEqual({ primary: true, translation: false }));
  it("english falls back to the primary when there is no translation", () =>
    expect(visibleSides("english", { primary: true, translation: false })).toEqual({ primary: true, translation: false }));
  it("hebrew falls back to the translation when there is no primary", () =>
    expect(visibleSides("hebrew", { primary: false, translation: true })).toEqual({ primary: false, translation: true }));
});

describe("segment numbers", () => {
  it("follows the panel language, and the interface language when bilingual", () => {
    expect(numberLang("hebrew", "english")).toBe("he");
    expect(numberLang("english", "hebrew")).toBe("en");
    expect(numberLang("bilingual", "hebrew")).toBe("he");
    expect(numberLang("bilingual", "english")).toBe("en");
  });
  it("renders numerals", () => {
    expect(segmentNumber("12", "en")).toBe("12");
    expect(segmentNumber("12", "he")).toBe("יב");
    expect(segmentNumber("15", "he")).toBe("טו");
  });
  it("leaves non-numeric addresses alone", () => expect(segmentNumber("2a", "he")).toBe("2a"));
});

describe("which books show segment numbers", () => {
  it("hides them for liturgy, reference works and the Guide", () => {
    expect(showsSegmentNumbers("Siddur Ashkenaz", ["Liturgy", "Siddur"])).toBe(false);
    expect(showsSegmentNumbers("Jastrow", ["Reference", "Dictionary"])).toBe(false);
    expect(showsSegmentNumbers("Guide for the Perplexed, Part 1", ["Jewish Thought"])).toBe(false);
    expect(showsSegmentNumbers("Genesis", ["Tanakh", "Torah"])).toBe(true);
  });
});

describe("link-count dot opacity", () => {
  it.each([[0, 0], [1, 0.21], [10, 0.3], [50, 0.7], [500, 0.7]])("%i links → %f", (n, o) => expect(linkDotOpacity(n)).toBeCloseTo(o, 5));
});

describe("segmentNumberLang", () => {
  it("follows the panel's label language", () => {
    expect(segmentNumberLang("bilingual", "he")).toBe("he");
    expect(segmentNumberLang("english", "he")).toBe("he"); // Zohar: the Hebrew Translation
  });
  it("a Hebrew source alone in an English or bilingual panel is numbered in digits", () => {
    expect(segmentNumberLang("english", "he", "rtl")).toBe("en");
    expect(segmentNumberLang("bilingual", "he", "rtl")).toBe("en");
  });
  it("an English source alone in a Hebrew panel is numbered in digits (an English-original work in Hebrew mode)", () => {
    expect(segmentNumberLang("hebrew", "en", "ltr")).toBe("en");
    expect(segmentNumberLang("hebrew", "he", "ltr")).toBe("en");
  });
  it("a source alone that agrees with the panel keeps the label language", () => {
    expect(segmentNumberLang("hebrew", "he", "rtl")).toBe("he");
    expect(segmentNumberLang("english", "en", "ltr")).toBe("en");
  });
});
