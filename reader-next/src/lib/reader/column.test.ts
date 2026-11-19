import { describe, expect, it } from "vitest";
import { focusRule, needsMore, nextToLoad, pickFocusSegment, pickVisibleSection, scrollCompensation, sectionsToTrim } from "./column";

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

describe("sectionsToTrim (windowing)", () => {
  // Psalms 1-8 as measured after a long read with no pause (Linux CI, 2026-11-08): the reader in Psalms 7, the view 284..900
  const bottoms: Record<string, [number, number]> = {
    "Psalms 1": [-12800, -11555], "Psalms 2": [-11500, -9329], "Psalms 3": [-9300, -7758], "Psalms 4": [-7700, -6151],
    "Psalms 5": [-6100, -3766], "Psalms 6": [-3700, -1911], "Psalms 7": [-1850, 1200], "Psalms 8": [1250, 2931],
  };
  const refs = Object.keys(bottoms);
  const box = (ref: string) => (bottoms[ref] ? { top: bottoms[ref]![0], bottom: bottoms[ref]![1] } : undefined);
  const view = { top: 284, bottom: 900 };
  const reading = (ref: string) => ref === "Psalms 7";

  it("lets go of everything wholly out of reach above, down to the minimum, giving back the nearest first", () => {
    // 1-6 are all out of reach (1,848 px); taking all six would leave two, so Psalms 6 stays
    expect([...sectionsToTrim(refs, box, view, 1848, reading, 3)]).toEqual(["Psalms 1", "Psalms 2", "Psalms 3", "Psalms 4", "Psalms 5"]);
  });
  it("takes all of them when enough are left", () => {
    expect([...sectionsToTrim(refs, box, view, 1848, reading, 2)]).toEqual(["Psalms 1", "Psalms 2", "Psalms 3", "Psalms 4", "Psalms 5", "Psalms 6"]);
  });
  it("stops at a kept section and at one within reach", () => {
    expect([...sectionsToTrim(refs, box, view, 1848, (r) => r === "Psalms 3" || reading(r), 3)]).toEqual(["Psalms 1", "Psalms 2"]);
    expect([...sectionsToTrim(refs, box, view, 9000, reading, 3)]).toEqual(["Psalms 1", "Psalms 2"]);
  });
  it("trims below as well, and nothing when there is nothing to spare", () => {
    const far: Record<string, [number, number]> = { ...bottoms, "Psalms 9": [9000, 10000] };
    const b = (ref: string) => (far[ref] ? { top: far[ref]![0], bottom: far[ref]![1] } : undefined);
    expect([...sectionsToTrim(Object.keys(far), b, view, 1848, reading, 3)].sort()).toEqual(["Psalms 1", "Psalms 2", "Psalms 3", "Psalms 4", "Psalms 5", "Psalms 9"]);
    expect(sectionsToTrim(["Psalms 1", "Psalms 7", "Psalms 8"], box, view, 1848, reading, 3).size).toBe(0);
  });
});
