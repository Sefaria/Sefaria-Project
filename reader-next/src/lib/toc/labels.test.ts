import { describe, expect, it } from "vitest";
import { refContains, splitSpanningRefNaive, zoomOutRef } from "./refs";
import { hebrewTerm, sectionLabel } from "./labels";

// @feature BOK-014
describe("section labels (old getSectionStringByAddressType)", () => {
  it("Talmud: dafs by amud, with the node's offset (Berakhot starts at 2a: offset 2)", () => {
    expect(sectionLabel("Talmud", 0, 2).en).toBe("2a");
    expect(sectionLabel("Talmud", 1, 2).en).toBe("2b");
    expect(sectionLabel("Talmud", 63, 2).en).toBe("33b");
    expect(sectionLabel("Talmud", 0, 2).he).toBe("ב.");
    expect(sectionLabel("Talmud", 1, 2).he).toBe("ב:");
  });
  it("Folio: four columns", () => {
    expect(sectionLabel("Folio", 2, 0).en).toBe("1c");
    expect(sectionLabel("Folio", 4, 0).en).toBe("2a");
  });
  it("Integer and everything else: 1, 2, 3 with Hebrew letters", () => {
    expect(sectionLabel("Integer", 0)).toEqual({ en: "1", he: "א" });
    expect(sectionLabel("Perek", 14)).toEqual({ en: "15", he: "טו" });
    expect(sectionLabel(undefined, 49).en).toBe("50");
    expect(sectionLabel("Integer", 0, 1).en).toBe("2"); // index_offsets_by_depth
  });
  it("Year: 1241 + n, the Hebrew numeral with a gershayim", () => {
    expect(sectionLabel("Year", 0).en).toBe("1241");
    expect(sectionLabel("Year", 14).he).toBe('ט"ו');
  });
  it("section names in Hebrew", () => {
    expect(hebrewTerm("Chapter")).toBe("פרק");
    expect(hebrewTerm("Unheard Of Term")).toBe("Unheard Of Term");
  });
});

// @feature BOK-011 @feature BOK-013
describe("ref arithmetic", () => {
  it("contains: a chapter contains its verses, a range its parts, never another book", () => {
    expect(refContains("Genesis 2", "Genesis 2:5")).toBe(true);
    expect(refContains("Genesis 2", "Genesis 3:1")).toBe(false);
    expect(refContains("Genesis 1:1-6:8", "Genesis 2:5")).toBe(true);
    expect(refContains("Genesis 1:1-6:8", "Genesis 6:9")).toBe(false);
    expect(refContains("Genesis 2:4-2:19", "Genesis 2:5")).toBe(true);
    expect(refContains("Genesis 2", "Exodus 2:5")).toBe(false);
  });
  it("contains, for Talmud: dafs compare by position", () => {
    expect(refContains("Berakhot 2a:1-13a:15", "Berakhot 5b:3")).toBe(true);
    expect(refContains("Berakhot 2a:1-13a:15", "Berakhot 13b:1")).toBe(false);
    expect(refContains("Berakhot 2b", "Berakhot 2b:4")).toBe(true);
    expect(refContains("Berakhot 2b", "Berakhot 3a")).toBe(false);
  });
  it("a node of a complex text contains everything in it", () => {
    expect(refContains("Pesach Haggadah, Kadesh", "Pesach Haggadah, Kadesh 3")).toBe(true);
    expect(refContains("Pesach Haggadah, Kadesh", "Pesach Haggadah, Urchatz 1")).toBe(false);
  });
  it("missing refs are undefined, not false", () => {
    expect(refContains(undefined, "Genesis 1")).toBeUndefined();
  });
  it("zoom out and split a span", () => {
    expect(zoomOutRef("Zohar 1:2:3", 1)).toBe("Zohar 1:2");
    expect(zoomOutRef("Zohar 1:2:3", 3)).toBe("Zohar");
    expect(splitSpanningRefNaive("Genesis 1:1-6:8")).toBe("Genesis 1:1");
    expect(splitSpanningRefNaive("Genesis 1:1")).toBe("Genesis 1:1");
  });
});
