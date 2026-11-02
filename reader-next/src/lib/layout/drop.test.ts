import { describe, expect, it } from "vitest";
import { applyDrop, changes, dropFor, zoneAt, zoneRect } from "./drop";
import { column, dock, leaf, row, split, swap, type LayoutNode } from "./tree";

const show = (n: LayoutNode | null): string =>
  !n ? "∅" : n.type === "leaf" ? n.id : `${n.direction === "row" ? "row" : "col"}(${n.children.map(show).join(",")})`;

const box = { left: 100, top: 0, width: 400, height: 800 };

describe("zoneAt", () => {
  it("is the centre in the middle box", () => {
    expect(zoneAt(box, 300, 400)).toBe("centre");
    expect(zoneAt(box, 221, 241)).toBe("centre");
  });
  it("is the nearest edge outside it", () => {
    expect(zoneAt(box, 110, 400)).toBe("before");
    expect(zoneAt(box, 490, 400)).toBe("after");
    expect(zoneAt(box, 300, 20)).toBe("above");
    expect(zoneAt(box, 300, 790)).toBe("below");
    // near the top-left corner, but closer to the left edge (as a share of each side)
    expect(zoneAt(box, 110, 200)).toBe("before");
  });
});

describe("zoneRect", () => {
  it("highlights the matching half, or the whole target for the centre", () => {
    expect(zoneRect(box, "before")).toEqual({ left: 100, top: 0, width: 200, height: 800 });
    expect(zoneRect(box, "after")).toEqual({ left: 300, top: 0, width: 200, height: 800 });
    expect(zoneRect(box, "above")).toEqual({ left: 100, top: 0, width: 400, height: 400 });
    expect(zoneRect(box, "below")).toEqual({ left: 100, top: 400, width: 400, height: 400 });
    expect(zoneRect(box, "centre")).toEqual(box);
  });
});

describe("drops", () => {
  const abc = row(leaf("a"), leaf("b"), leaf("c"));

  it("stacks a panel above another (Rashi above Tosafot, left of the Talmud)", () => {
    const talmudLast = applyDrop(abc, "a", dropFor("c", "after"));
    expect(show(talmudLast)).toBe("row(b,c,a)");
    expect(show(applyDrop(talmudLast, "b", dropFor("c", "above")))).toBe("row(col(b,c),a)");
  });

  it("swaps on the centre, keeping each place's size", () => {
    const t = split("row", [leaf("a"), leaf("b")], [0.7, 0.3]);
    const s = applyDrop(t, "a", dropFor("b", "centre"));
    expect(show(s)).toBe("row(b,a)");
    expect(s.type === "split" && s.sizes).toEqual([0.7, 0.3]);
  });

  it("docks at an end of the whole workspace at full height", () => {
    const t = row(column(leaf("a"), leaf("b")), leaf("c"));
    expect(show(applyDrop(t, "c", { kind: "dock", placement: "before" }))).toBe("row(c,col(a,b))");
    expect(show(applyDrop(column(leaf("a"), leaf("b")), "a", { kind: "dock", placement: "after" }))).toBe("row(b,a)");
  });

  it("knows when a drop changes nothing", () => {
    expect(changes(abc, "a", dropFor("a", "after"))).toBe(false);
    expect(changes(abc, "a", dropFor("b", "before"))).toBe(false);
    expect(changes(abc, "a", dropFor("b", "after"))).toBe(true);
    expect(changes(abc, "a", { kind: "dock", placement: "before" })).toBe(false);
    expect(changes(abc, "a", dropFor("c", "centre"))).toBe(true);
  });
});

describe("swap and dock", () => {
  it("swap leaves the shape alone", () => {
    expect(show(swap(row(leaf("a"), column(leaf("b"), leaf("c"))), "a", "c"))).toBe("row(c,col(b,a))");
  });
  it("dock joins a split of the same direction, taking an equal share", () => {
    const t = dock(split("row", [leaf("a"), leaf("b"), leaf("c")], [0.5, 0.25, 0.25]), "a", "after");
    expect(show(t)).toBe("row(b,c,a)");
    expect(t.type === "split" && t.sizes?.map((s) => Math.round(s * 1000) / 1000)).toEqual([0.333, 0.333, 0.333]);
  });
});
