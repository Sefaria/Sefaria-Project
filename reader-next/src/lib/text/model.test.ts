import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { normaliseTexts, type RawTextsResponse } from "./model";

const load = (slug: string, file = "v3-texts.json") => normaliseTexts(readFixture<RawTextsResponse>(`${slug}/${file}`));

// @feature TXD-010 @feature TXT-007
describe("normaliseTexts across book types", () => {
  it("Tanakh chapter: one segment per verse", () => {
    const p = load("genesis-1");
    expect(p.segments).toHaveLength(31);
    expect(p.segments[0]!.ref).toBe("Genesis 1:1");
    expect(p.segments[30]!.ref).toBe("Genesis 1:31");
    expect(p.sectionRefs).toEqual(["Genesis 1"]);
    // Genesis opens with an enlarged bet, delivered as <big> markup.
    expect(p.segments[0]!.primary).toMatch(/^<big>[^<]+<\/big>/);
    expect(p.segments[0]!.translation).toBeTruthy();
    expect(p.primaryVersion?.direction).toBe("rtl");
    expect(p.translationVersion?.direction).toBe("ltr");
  });

  it("segment range within a chapter starts at the requested verse", () => {
    const p = load("genesis-1-1-5");
    expect(p.segments.map((s) => s.ref)).toEqual(["Genesis 1:1", "Genesis 1:2", "Genesis 1:3", "Genesis 1:4", "Genesis 1:5"]);
    expect(p.sectionRef).toBe("Genesis 1");
  });

  it("Talmud amud: lines addressed under the daf", () => {
    const p = load("berakhot-2a");
    expect(p.segments[0]!.ref).toBe("Berakhot 2a:1");
    expect(p.segments.at(-1)!.ref).toBe(`Berakhot 2a:${p.segments.length}`);
  });

  it("Talmud spanning range: amudim follow 2a → 2b → 3a → 3b", () => {
    const p = load("berakhot-2a-3b");
    expect(p.isSpanning).toBe(true);
    expect(p.sectionRefs).toEqual(["Berakhot 2a", "Berakhot 2b", "Berakhot 3a", "Berakhot 3b"]);
    expect(p.segments[0]!.ref).toBe("Berakhot 2a:1");
  });

  // CODE_REVIEW R-18: a segment range across chapters gave refs like "Genesis 1:30-31:1"
  it("a segment range across chapters: each part starts at its own verse", () => {
    const p = load("genesis-1-30-2-3");
    expect(p.isSpanning).toBe(true);
    expect(p.segments.map((s) => s.ref)).toEqual(["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2", "Genesis 2:3"]);
    expect(p.sectionRefs).toEqual(["Genesis 1", "Genesis 2"]);
  });

  it("a commentary range across chapters: chapter → verse → comment, an empty verse skipped", () => {
    const p = load("rashi-on-genesis-1-31-2-2");
    expect(p.segments.map((s) => s.ref)).toEqual(["Rashi on Genesis 1:31:1", "Rashi on Genesis 2:2:1"]);
    expect(p.sectionRefs).toEqual(["Rashi on Genesis 1:31", "Rashi on Genesis 2:2"]);
  });

  it("Yerushalmi halakhah: three-level addresses", () => {
    const p = load("jt-berakhot-1-1");
    expect(p.segments[0]!.ref).toBe("Jerusalem Talmud Berakhot 1:1:1");
    expect(p.sectionRefs).toEqual(["Jerusalem Talmud Berakhot 1:1"]);
  });

  it("Commentary chapter: comments grouped by verse sections", () => {
    const p = load("rashi-on-genesis-1");
    expect(p.segments[0]!.ref).toBe("Rashi on Genesis 1:1:1");
    expect(p.segments[0]!.sectionRef).toBe("Rashi on Genesis 1:1");
    expect(p.sectionRefs.length).toBeGreaterThan(1);
    expect(p.isDependant).toBe(true);
    expect(p.collectiveTitle).toBe("Rashi");
  });

  it("Complex schema node: depth-1 paragraphs under the node title", () => {
    const p = load("pesach-haggadah-kadesh");
    expect(p.isComplex).toBe(true);
    expect(p.segments[0]!.ref).toBe("Pesach Haggadah, Kadesh 1");
    expect(p.sectionRefs).toEqual(["Pesach Haggadah, Kadesh"]);
    expect(p.next).toBe("Pesach Haggadah, Urchatz");
  });

  it("primary and translation of the same address merge into one segment", () => {
    const p = load("genesis-1");
    expect(new Set(p.segments.map((s) => s.ref)).size).toBe(p.segments.length);
  });
});

// @feature TXT-022 Zohar's paragraphs run on from section to section (index_offsets_by_depth; old makeSegments, T-G05)
describe("numbering offsets", () => {
  const zohar = (over: Partial<RawTextsResponse>): RawTextsResponse =>
    ({
      ref: "Zohar, Bereshit 2", heRef: "", sectionRef: "Zohar, Bereshit 2", heSectionRef: "", book: "Zohar, Bereshit", indexTitle: "Zohar", heIndexTitle: "", categories: ["Kabbalah", "Zohar"],
      primary_category: "Kabbalah", isComplex: true, isDependant: false, isSpanning: false, textDepth: 2, sectionNames: ["Chapter", "Paragraph"], addressTypes: ["Integer", "Integer"],
      sections: ["2"], toSections: ["2"], next: null, prev: null,
      versions: [{ text: ["a", "b", "c"], isPrimary: true, isSource: true, direction: "rtl", language: "he", versionTitle: "v", languageFamilyName: "hebrew" }],
      index_offsets_by_depth: { "2": [2] },
      ...over,
    }) as unknown as RawTextsResponse;
  it("a section starts after its offset (VERIFIED on sefaria.org 2026-11-10: Zohar, Bereshit 2 opens at 2:3)", () => {
    expect(normaliseTexts(zohar({})).segments.map((s) => s.ref)).toEqual(["Zohar, Bereshit 2:3", "Zohar, Bereshit 2:4", "Zohar, Bereshit 2:5"]);
  });
  it("a requested paragraph keeps its own number; a range across sections takes each section's offset", () => {
    expect(normaliseTexts(zohar({ ref: "Zohar, Bereshit 2:4-5", sections: ["2", "4"], toSections: ["2", "5"], versions: [{ text: ["b", "c"], isPrimary: true, isSource: true, direction: "rtl", language: "he", versionTitle: "v", languageFamilyName: "hebrew" }] as never })).segments.map((s) => s.ref)).toEqual(["Zohar, Bereshit 2:4", "Zohar, Bereshit 2:5"]);
    const range = zohar({ ref: "Zohar, Bereshit 2:5-3:15", sections: ["2", "5"], toSections: ["3", "15"], isSpanning: true, index_offsets_by_depth: { "2": [2, 13] }, versions: [{ text: [["c"], ["d", "e", "f"]], isPrimary: true, isSource: true, direction: "rtl", language: "he", versionTitle: "v", languageFamilyName: "hebrew" }] as never });
    expect(normaliseTexts(range).segments.map((s) => s.ref)).toEqual(["Zohar, Bereshit 2:5", "Zohar, Bereshit 3:14", "Zohar, Bereshit 3:15", "Zohar, Bereshit 3:16"]);
  });
  it("no offsets (or all zero): numbering from 1, as before", () => {
    expect(normaliseTexts(zohar({ index_offsets_by_depth: { "2": [0] } })).segments[0]!.ref).toBe("Zohar, Bereshit 2:1");
    expect(normaliseTexts(zohar({ index_offsets_by_depth: undefined })).segments[0]!.ref).toBe("Zohar, Bereshit 2:1");
  });
});
