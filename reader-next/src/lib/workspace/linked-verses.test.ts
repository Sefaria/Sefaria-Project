import { describe, expect, it } from "vitest";
import type { RelatedLink } from "~/lib/connections/links";
import { linkedSegmentsIn, sectionOfSegment } from "./linked-verses";

const link = (index_title: string, sourceRef: string, anchor: string[]) => ({ index_title, sourceRef, anchorRefExpanded: anchor }) as RelatedLink;

describe("sectionOfSegment", () => {
  it("drops the last address", () => {
    expect(sectionOfSegment("Genesis 1:3")).toBe("Genesis 1");
    expect(sectionOfSegment("Rashi on Berakhot 2a:3:1")).toBe("Rashi on Berakhot 2a:3");
    expect(sectionOfSegment("Genesis")).toBe("Genesis");
  });
});

describe("linkedSegmentsIn", () => {
  const fromGenesis = [
    link("Rashi on Genesis", "Rashi on Genesis 1:3:1", ["Genesis 1:3"]),
    link("Rashi on Genesis", "Rashi on Genesis 1:3:2-3", ["Genesis 1:3"]),
    link("Rashi on Genesis", "Rashi on Genesis 1:4:1", ["Genesis 1:4"]),
    link("Ramban on Genesis", "Ramban on Genesis 1:3:1", ["Genesis 1:3"]),
  ];

  it("finds a commentator's comments on a verse, ranges expanded", () => {
    expect(linkedSegmentsIn(fromGenesis, "Genesis 1:3", "Genesis", "Rashi on Genesis")).toEqual([
      "Rashi on Genesis 1:3:1",
      "Rashi on Genesis 1:3:2",
      "Rashi on Genesis 1:3:3",
    ]);
  });

  it("finds the verse a comment is on", () => {
    const fromRashi = [link("Genesis", "Genesis 1:3", ["Rashi on Genesis 1:3:2"])];
    expect(linkedSegmentsIn(fromRashi, "Rashi on Genesis 1:3:2", "Rashi on Genesis", "Genesis")).toEqual(["Genesis 1:3"]);
  });

  it("matches verse for verse within one book, and nothing for an unrelated one", () => {
    expect(linkedSegmentsIn([], "Genesis 1:3", "Genesis", "Genesis")).toEqual(["Genesis 1:3"]);
    expect(linkedSegmentsIn(fromGenesis, "Genesis 1:3", "Genesis", "Exodus")).toEqual([]);
  });
});
