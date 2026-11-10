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
  it("keeps every range of several segments, inside one section or across sections (owner 2026-11-10)", () => {
    expect(keepsRange({ segments: 5 })).toBe(true); // Genesis 1:30-2:3
    expect(keepsRange({ segments: 3 })).toBe(true); // Genesis 1:3-5: legacy's collapse is a race, not ported
    expect(keepsRange({ segments: 1 })).toBe(false);
  });
  it("a selection writes the range with the sidebar open; closed, only inside the section being read; else the address stays", () => {
    const sectionSegments = ["Genesis 1:29", "Genesis 1:30", "Genesis 1:31", "Genesis 1:3", "Genesis 1:4", "Genesis 1:5"];
    const across = ["Genesis 1:30", "Genesis 1:31", "Genesis 2:1", "Genesis 2:2"];
    expect(selectionAddress(across, { sidebarOpen: true, sectionSegments })).toBe("Genesis 1:30-2:2");
    expect(selectionAddress(across, { sidebarOpen: false, sectionSegments })).toBeUndefined();
    expect(selectionAddress(["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"], { sidebarOpen: false, sectionSegments })).toBe("Genesis 1:3-5");
    expect(selectionAddress(["Genesis 1:3"], { sidebarOpen: true, sectionSegments })).toBeUndefined();
  });
  it("a range of whole sections is all highlighted at once and written by its segments once its last section is known", () => {
    const passage = (ref: string, n: number) =>
      ({ ref, book: ref.split(" ")[0], segments: Array.from({ length: n }, (_, i) => ({ ref: `${ref}:${i + 1}`, address: [ref.split(" ")[1]!, String(i + 1)] })) }) as unknown as TextPassage;
    const all = [passage("Genesis 6", 22), passage("Genesis 7", 24), passage("Genesis 8", 22)];
    const r = wholeSectionRange("Genesis 6-8", "Genesis 6", all)!;
    expect(r.ref).toBe("Genesis 6:1-8:22");
    expect(r.lastSection).toBe("Genesis 8");
    expect(isHighlighted(["8", "22"], r.highlight, ["Integer", "Integer"])).toBe(true);
    expect(isHighlighted(["9", "1"], r.highlight, ["Integer", "Integer"])).toBe(false);
    // Genesis 1-50 (sefaria.org: /Genesis.1.1-50.26, every verse blue): only the first sections load with the page. The highlight runs
    // to the end of chapter 50 by address at once; the address waits for chapter 50 itself (one request), then names its last verse.
    const early = wholeSectionRange("Genesis 1-50", "Genesis 1", [passage("Genesis 1", 31), passage("Genesis 2", 25)])!;
    expect(early.ref).toBeUndefined();
    expect(early.lastSection).toBe("Genesis 50");
    for (const [a, hl] of [[["1", "1"], true], [["2", "25"], true], [["30", "4"], true], [["50", "26"], true], [["50", "99"], true]] as const)
      expect(isHighlighted([...a], early.highlight, ["Integer", "Integer"])).toBe(hl);
    const late = wholeSectionRange("Genesis 1-50", "Genesis 1", [passage("Genesis 1", 31), passage("Genesis 2", 25), passage("Genesis 50", 26)])!;
    expect(late.ref).toBe("Genesis 1:1-50:26");
    expect(isHighlighted(["50", "26"], late.highlight, ["Integer", "Integer"])).toBe(true);
    // the section that came back is not the one asked for (a shorter text, an error): the address stays as typed
    expect(wholeSectionRange("Genesis 1-50", "Genesis 1", [passage("Genesis 1", 31), { ...passage("Genesis 49", 33), ref: "Genesis 50" }])?.ref).toBeUndefined();
    const daf = (ref: string, n: number) =>
      ({ ref, book: ref.split(" ")[0], segments: Array.from({ length: n }, (_, i) => ({ ref: `${ref}:${i + 1}`, address: [ref.split(" ")[1]!, String(i + 1)] })) }) as unknown as TextPassage;
    expect(wholeSectionRange("Berakhot 2a-2b", "Berakhot 2a", [daf("Berakhot 2a", 14), daf("Berakhot 2b", 19)])?.ref).toBe("Berakhot 2a:1-2b:19");
    const shabbat = wholeSectionRange("Shabbat 2a-157b", "Shabbat 2a", [daf("Shabbat 2a", 10)])!;
    expect(shabbat.lastSection).toBe("Shabbat 157b");
    expect(isHighlighted(["157b", "5"], shabbat.highlight, ["Talmud", "Integer"])).toBe(true);
    expect(isHighlighted(["158a", "1"], shabbat.highlight, ["Talmud", "Integer"])).toBe(false);
    expect(wholeSectionRange("Genesis 6", "Genesis 6", all)).toBeNull();
    expect(wholeSectionRange("Genesis 6:3-8:2", "Genesis 6", all)).toBeNull(); // names segments: the planner's highlight
  });
});
