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
