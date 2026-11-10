import { describe, expect, it } from "vitest";
import { anyFullImage, longestPrefixSuffixIndex, longestSuffixPrefixIndex, segmentPlainText, sheetExtras, sourceText, trimToSelection } from "./sheet-source";

// @feature CON-056 Partial word selection in Add to Sheet (old handleSelectedWords, T-G04)
describe("Add to Sheet: the selected words", () => {
  it("the old overlap helpers", () => {
    expect(longestSuffixPrefixIndex("In the beginning God created", "God created the heaven")).toBe(17);
    expect(longestPrefixSuffixIndex("and the earth was void", "heaven and the earth")).toBe(13);
  });
  it("across verses: the first is cut before the selection, the last after it", () => {
    const out = trimToSelection(["In the beginning God created the heaven and the earth.", "Now the earth was unformed and void."], "the heaven and the earth. Now the earth");
    expect(out).toEqual(["...the heaven and the earth.", "Now the earth..."]);
  });
  it("inside one verse: both ends are cut (the old code added the whole verse)", () => {
    expect(trimToSelection(["In the beginning God created the heaven and the earth."], "God created")).toEqual(["...God created..."]);
    expect(trimToSelection(["In the beginning God created"], "In the beginning God created")).toEqual(["In the beginning God created"]);
    expect(trimToSelection(["In the beginning"], "not there")).toEqual(["In the beginning"]);
  });
  it("a segment's words: no footnotes, tags or entities", () => {
    expect(segmentPlainText('When God began<sup class="footnote-marker">a</sup><i class="footnote">Others: In the beginning</i> to&nbsp;create <b>heaven</b>')).toBe("When God began to create heaven");
  });
  it("formats the source as the old segmentsToSourceText (numbers, paragraphs)", () => {
    const segs = [{ number: "1", text: "...the heaven" }, { number: "2", text: "Now the earth..." }];
    expect(sourceText(segs, { categories: ["Tanakh", "Torah"], book: "Genesis", side: "en" })).toBe("<span class='segment'><small>(1)</small> ...the heaven </span> <span class='segment'><small>(2)</small> Now the earth... </span> ");
    expect(sourceText(segs, { categories: ["Tanakh"], book: "Genesis", side: "he" })).toContain("<small>(א׳)</small>");
    expect(sourceText(segs, { categories: ["Mishnah"], book: "Mishnah Berakhot", side: "en" })).toMatch(/^<p><span class='segment'><small>\(1\)<\/small>/);
    expect(sourceText(segs, { categories: ["Talmud", "Bavli"], book: "Berakhot", side: "en" })).toBe("<span class='segment'>...the heaven </span> <span class='segment'>Now the earth... </span> ");
  });
});

// @feature CON-056 The image guard (old checkContentForImages)
describe("Add to Sheet: images", () => {
  it("a verse that is only an image blocks the add; an inline image does not", () => {
    expect(anyFullImage(["text", '<img src="https://textimages.sefaria.org/a.png">'])).toBe(true);
    expect(anyFullImage(['text <img src="https://textimages.sefaria.org/a.png">', undefined])).toBe(false);
  });
});

// @feature CON-056
describe("sheetExtras: what Add to Sheet adds for the chosen verses", () => {
  const section = {
    categories: ["Tanakh", "Torah"],
    indexTitle: "Genesis",
    primaryVersion: { versionTitle: "Miqra", direction: "rtl" },
    translationVersion: { versionTitle: "JPS", direction: "ltr" },
    segments: [
      { ref: "Genesis 1:1", address: ["1", "1"], sectionRef: "Genesis 1", primary: "בראשית ברא", translation: "In the beginning God created the heaven." },
      { ref: "Genesis 1:2", address: ["1", "2"], sectionRef: "Genesis 1", primary: "והארץ", translation: "Now the earth was void." },
    ],
  } as unknown as Parameters<typeof sheetExtras>[0];
  const refs = ["Genesis 1:1", "Genesis 1:2"];
  it("English shown, words selected over these verses: the English text cut to them", () => {
    const x = sheetExtras(section, refs, "english", { words: "the heaven. Now the earth", refs });
    expect(x.text).toEqual({ side: "en", html: "<span class='segment'><small>(1)</small> ...the heaven. </span> <span class='segment'><small>(2)</small> Now the earth... </span> " });
  });
  it("no trimming in bilingual, with no selection, or a selection on other verses", () => {
    expect(sheetExtras(section, refs, "bilingual", { words: "the heaven", refs }).text).toBeUndefined();
    expect(sheetExtras(section, refs, "english", null).text).toBeUndefined();
    expect(sheetExtras(section, refs, "english", { words: "the heaven", refs: ["Genesis 1:1"] }).text).toBeUndefined();
  });
  it("flags a verse that is only an image", () => {
    const img = { ...section, segments: [{ ...section!.segments[0]!, translation: '<img src="https://textimages.sefaria.org/a.png" alt="x">' }] } as typeof section;
    expect(sheetExtras(img, ["Genesis 1:1"], "english", null).hasImage).toBe(true);
    expect(sheetExtras(section, ["Genesis 1:1"], "english", null).hasImage).toBe(false);
  });
});
