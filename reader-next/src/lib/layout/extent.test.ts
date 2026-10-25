import { describe, expect, it } from "vitest";
import { childMinimums, dragDivider, minExtent, overflows, toShares, trackLength } from "./extent";
import { column, leaf, row } from "./tree";

const minOf = (id: string, dir: "row" | "column") => (dir === "row" ? (id === "wide" ? 720 : 360) : 240);

describe("layout extents", () => {
  it("adds minimums along a split and takes the largest across it", () => {
    expect(minExtent(row(leaf("a"), column(leaf("b"), leaf("wide"))), "row", minOf)).toBe(360 + 720);
    expect(minExtent(row(leaf("a"), column(leaf("b"), leaf("c"))), "column", minOf)).toBe(480);
  });

  it("keeps each child's own minimum while the children fit, or before the split is measured", () => {
    expect(childMinimums([0.5, 0.5], [360, 360], 1280)).toEqual([360, 360]);
    expect(childMinimums([0.5, 0.5], [360, 360], undefined)).toEqual([360, 360]);
    expect(overflows([360, 360], undefined)).toBe(false);
  });

  it("turns shares into pixel widths once the children overflow: equal shares sit at the minimum", () => {
    const five = [0.2, 0.2, 0.2, 0.2, 0.2];
    expect(childMinimums(five, five.map(() => 360), 1280)).toEqual([360, 360, 360, 360, 360]);
  });

  it("a wider share stays wider when overflowing; the narrowest child for its share sits at its minimum", () => {
    const shares = toShares([560, 360, 360, 360, 360]);
    expect(trackLength(shares, [360, 360, 360, 360, 360])).toBeCloseTo(2000);
    expect(childMinimums(shares, [360, 360, 360, 360, 360], 1280).map(Math.round)).toEqual([560, 360, 360, 360, 360]);
  });

  it("a panel with a sidebar needs room for both", () => {
    expect(childMinimums([0.4, 0.2, 0.2, 0.2], [720, 360, 360, 360], 1280)).toEqual([720, 360, 360, 360]);
  });
});

describe("dragging a divider", () => {
  it("trades length between the two neighbours while the children fit, never below a minimum", () => {
    expect(dragDivider([640, 640], [360, 360], 1, 100, false)).toEqual([740, 540]);
    expect(dragDivider([640, 640], [360, 360], 1, 1000, false)).toEqual([920, 360]);
    expect(dragDivider([640, 640], [360, 360], 1, -1000, false)).toEqual([360, 920]);
  });

  it("while the split scrolls, resizes only the child before the divider (the split grows or shrinks)", () => {
    expect(dragDivider([360, 360, 360, 360], [360, 360, 360, 360], 1, 200, true)).toEqual([560, 360, 360, 360]);
    expect(dragDivider([560, 360, 360, 360], [360, 360, 360, 360], 1, -500, true)).toEqual([360, 360, 360, 360]);
  });

  it("leaves a child already squeezed below its minimum alone", () => {
    expect(dragDivider([300, 980], [360, 360], 1, -50, false)).toEqual([300, 980]);
  });
});
