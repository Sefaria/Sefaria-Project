import { describe, expect, it } from "vitest";
import { focusRule, needsMore, nextToLoad, pickFocusSegment, pickVisibleSection, scrollCompensation } from "./column";

// @feature TXD-055
describe("pickVisibleSection", () => {
  const rects = [
    { ref: "Genesis 1", top: -1500, bottom: -100 },
    { ref: "Genesis 2", top: -100, bottom: 900 },
    { ref: "Genesis 3", top: 900, bottom: 2000 },
  ];
  it("picks the first section whose bottom is past the middle of the viewport", () => {
    expect(pickVisibleSection(rects, 800)).toBe("Genesis 2");
  });
  it("moves to the next section once the middle passes the previous one's bottom", () => {
    expect(pickVisibleSection([{ ref: "Genesis 2", top: -1200, bottom: 300 }, { ref: "Genesis 3", top: 300, bottom: 1500 }], 800)).toBe("Genesis 3");
  });
  it("falls back to the last section when all are above the middle", () => {
    expect(pickVisibleSection([{ ref: "A", top: -900, bottom: 100 }], 800)).toBe("A");
  });
  it("handles an empty column", () => expect(pickVisibleSection([], 800)).toBeUndefined());
});

// @feature TXD-052
describe("needsMore", () => {
  it("loads below when the bottom edge is near", () => {
    expect(needsMore({ top: 0, bottom: 1000 }, 800, "down")).toBe(true);
    expect(needsMore({ top: 0, bottom: 3000 }, 800, "down")).toBe(false);
  });
  it("loads above when the top edge is near", () => {
    expect(needsMore({ top: 50, bottom: 3000 }, 800, "up")).toBe(true);
    expect(needsMore({ top: -2000, bottom: 3000 }, 800, "up")).toBe(false);
  });
});

describe("nextToLoad", () => {
  const loaded = [
    { ref: "Genesis 2", prev: "Genesis 1", next: "Genesis 3" },
    { ref: "Genesis 3", prev: "Genesis 2", next: "Genesis 4" },
  ];
  it("returns the neighbour beyond each edge", () => {
    expect(nextToLoad(loaded, "down")).toBe("Genesis 4");
    expect(nextToLoad(loaded, "up")).toBe("Genesis 1");
  });
  it("returns nothing at the ends of the book", () => {
    expect(nextToLoad([{ ref: "Genesis 1", prev: null, next: "Genesis 2" }], "up")).toBeUndefined();
    expect(nextToLoad([{ ref: "Malachi 3", prev: "Malachi 2", next: null }], "down")).toBeUndefined();
  });
  it("never reloads a section already in the column", () => {
    expect(nextToLoad([{ ref: "A", prev: "B", next: null }, { ref: "B", prev: null, next: "A" }], "up")).toBeUndefined();
  });
});

describe("scrollCompensation", () => {
  it("is the height that was added above", () => expect(scrollCompensation(2000, 3400)).toBe(1400));
  it("never scrolls backwards", () => expect(scrollCompensation(3000, 2500)).toBe(0));
});

// @feature TXD-055 Visible-ref tracking drives URL and header
describe("pickFocusSegment (the old client's rule)", () => {
  const rule = { middle: 430, threshold: 140 };
  const seg = (ref: string, top: number, bottom: number) => ({ ref, top, bottom });

  it("skips segments wholly above the threshold and the middle", () => {
    expect(pickFocusSegment([seg("1:1", -200, 60), seg("1:2", 80, 130), seg("1:3", 160, 260)], rule)).toBe("1:3");
  });

  it("a segment starting at or below the threshold is current even if it ends above the middle", () => {
    expect(pickFocusSegment([seg("1:1", -50, 120), seg("1:2", 140, 200)], rule)).toBe("1:2");
  });

  it("a long segment straddling the middle is current even though it started above the threshold", () => {
    expect(pickFocusSegment([seg("1:1", -900, 600), seg("1:2", 640, 700)], rule)).toBe("1:1");
  });

  it("matches what the live reader picks after scrolling 300px (1:2 ends above the threshold, 1:3 starts below it)", () => {
    expect(pickFocusSegment([seg("Genesis 1:1", -140, -40), seg("Genesis 1:2", 10, 130), seg("Genesis 1:3", 170, 230)], rule)).toBe("Genesis 1:3");
  });

  it("tolerates sub-pixel placement on the threshold line", () => {
    expect(pickFocusSegment([seg("1:19", 40, 120), seg("1:20", 139.6, 200), seg("1:21", 230, 300)], rule)).toBe("1:20");
  });

  it("falls back to the last segment", () => {
    expect(pickFocusSegment([seg("a", -500, -400)], rule)).toBe("a");
    expect(pickFocusSegment([], rule)).toBeUndefined();
  });
});

describe("focusRule", () => {
  it("desktop: middle of the window, 140px threshold", () => expect(focusRule(860, { mobile: false })).toEqual({ middle: 430, threshold: 140 }));
  it("mobile: 70px threshold", () => expect(focusRule(800, { mobile: true })).toEqual({ middle: 400, threshold: 70 }));
  it("mobile with connections on screen: a quarter of the window", () => expect(focusRule(800, { mobile: true, connectionsOnScreen: true }).middle).toBe(200));
});
