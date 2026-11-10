import { describe, expect, it } from "vitest";
import { addressIn, highlightOf, keepsRange, rangeOf, selectionAddress, wholeSectionRange } from "./range-selection";
import { isHighlighted } from "./plan";
import type { TextPassage } from "./model";

// Owner decision 2026-11-10: ranges and selection as the old reader does them (VERIFIED on www.sefaria.org the same day)
describe("ranges and selection (legacy parity)", () => {
  it("writes a range from its first and last segments, as the old normRef", () => {
    expect(rangeOf(["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2"])).toBe("Genesis 1:30-2:2");
    expect(rangeOf(["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"])).toBe("Genesis 1:3-5");
    expect(rangeOf(["Genesis 1:3", "Genesis 1:35"])).toBe("Genesis 1:3-35");
    expect(rangeOf(["Berakhot 2b:5", "Berakhot 3a:2"])).toBe("Berakhot 2b:5-3a:2");
    expect(rangeOf(["Rashi on Genesis 1:31:1", "Rashi on Genesis 2:2:1"])).toBe("Rashi on Genesis 1:31:1-2:2:1");
    expect(rangeOf(["Genesis 1:3"])).toBe("Genesis 1:3");
    expect(rangeOf([])).toBeUndefined();
  });
  it("addresses a segment only within the book the server named", () => {
    expect(addressIn("Rashi on Genesis 1:31:1", "Rashi on Genesis")).toEqual(["1", "31", "1"]);
    expect(addressIn("Genesis 1:3", "Exodus")).toBeUndefined();
    const h = highlightOf(["Berakhot 2b:5", "Berakhot 3a:2"], "Berakhot")!;
    expect(isHighlighted(["2b", "19"], h, ["Talmud", "Integer"])).toBe(true);
    expect(isHighlighted(["3a", "3"], h, ["Talmud", "Integer"])).toBe(false);
  });
  it("keeps a pasted range across sections, and a portion; a range inside one section collapses", () => {
    expect(keepsRange({ segments: 5, sections: 2, portion: false })).toBe(true); // Genesis 1:30-2:3
    expect(keepsRange({ segments: 3, sections: 1, portion: false })).toBe(false); // Genesis 1:3-5
    expect(keepsRange({ segments: 31, sections: 1, portion: true })).toBe(true); // an aliyah
    expect(keepsRange({ segments: 1, sections: 1, portion: true })).toBe(false);
  });
  it("a selection writes the range with the sidebar open; closed, only inside the section being read; else the address stays", () => {
    const sectionSegments = ["Genesis 1:29", "Genesis 1:30", "Genesis 1:31", "Genesis 1:3", "Genesis 1:4", "Genesis 1:5"];
    const across = ["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2"];
    expect(selectionAddress(across, { sidebarOpen: true, sectionSegments })).toBe("Genesis 1:30-2:2");
    expect(selectionAddress(across, { sidebarOpen: false, sectionSegments })).toBeUndefined();
    expect(selectionAddress(["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"], { sidebarOpen: false, sectionSegments })).toBe("Genesis 1:3-5");
    expect(selectionAddress(["Genesis 1:3"], { sidebarOpen: true, sectionSegments })).toBeUndefined();
  });
  it("a range of whole sections is written by its segments, when every section is loaded", () => {
    const passage = (ref: string, n: number) => ({ ref, segments: Array.from({ length: n }, (_, i) => ({ ref: `${ref}:${i + 1}`, address: [ref.split(" ")[1]!, String(i + 1)] })) }) as unknown as TextPassage;
    const all = [passage("Genesis 6", 22), passage("Genesis 7", 24), passage("Genesis 8", 22)];
    expect(wholeSectionRange(["Genesis 6", "Genesis 7", "Genesis 8"], all)).toEqual({ highlight: { from: ["6", "1"], to: ["8", "22"] }, ref: "Genesis 6:1-8:22" });
    expect(wholeSectionRange(["Genesis 6", "Genesis 7", "Genesis 8"], all.slice(0, 2))).toBeNull();
    expect(wholeSectionRange(["Genesis 6"], all)).toBeNull();
  });
});
