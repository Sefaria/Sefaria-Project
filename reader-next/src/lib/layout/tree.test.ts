import { describe, expect, it } from "vitest";
import { column, insert, leaf, leaves, move, normalize, remove, replaceLeaf, row, withSizes, type LayoutNode } from "./tree";

const ids = (n: LayoutNode | null) => leaves(n);
/** Compact picture of a tree: row(a,col(b,c)) */
const show = (n: LayoutNode | null): string =>
  !n ? "∅" : n.type === "leaf" ? n.id : `${n.direction === "row" ? "row" : "col"}(${n.children.map(show).join(",")})`;

describe("layout tree", () => {
  it("builds rows and columns, flattening same-direction nesting", () => {
    expect(show(row(leaf("a"), row(leaf("b"), leaf("c"))))).toBe("row(a,b,c)");
    expect(show(row(leaf("a"), column(leaf("b"), leaf("c"))))).toBe("row(a,col(b,c))");
    expect(show(row(leaf("a")))).toBe("a");
    expect(ids(row(leaf("a"), column(leaf("b"), leaf("c"))))).toEqual(["a", "b", "c"]);
  });

  it("keeps sizes proportional when flattening", () => {
    const n = normalize<string>({ type: "split", direction: "row", sizes: [0.5, 0.5], children: [leaf("a"), { type: "split", direction: "row", sizes: [0.5, 0.5], children: [leaf("b"), leaf("c")] }] });
    expect(n.type === "split" && n.sizes).toEqual([0.5, 0.25, 0.25]);
  });

  describe("remove", () => {
    it("removes a leaf and collapses a split left with one child", () => {
      expect(show(remove(row(leaf("a"), column(leaf("b"), leaf("c"))), "c"))).toBe("row(a,b)");
      expect(show(remove(row(leaf("a"), leaf("b")), "a"))).toBe("b");
      expect(remove(leaf("a"), "a")).toBeNull();
    });
    it("gives the removed share to the siblings", () => {
      const t = remove<string>({ type: "split", direction: "row", sizes: [0.5, 0.25, 0.25], children: [leaf("a"), leaf("b"), leaf("c")] }, "a");
      expect(t?.type === "split" && t.sizes).toEqual([0.5, 0.5]);
    });
    it("ignores unknown ids", () => {
      expect(show(remove(row(leaf("a"), leaf("b")), "z"))).toBe("row(a,b)");
    });
  });

  describe("insert", () => {
    it("joins a split of the same direction (the old reader's 'open panel after')", () => {
      expect(show(insert(row(leaf("a"), leaf("b")), "a", leaf("x"), "after"))).toBe("row(a,x,b)");
      expect(show(insert(row(leaf("a"), leaf("b")), "a", leaf("x"), "before"))).toBe("row(x,a,b)");
    });
    it("wraps the target to stack vertically (future: one panel above another)", () => {
      expect(show(insert(row(leaf("a"), leaf("b")), "b", leaf("x"), "above"))).toBe("row(a,col(x,b))");
      expect(show(insert(leaf("a"), "a", leaf("x"), "below"))).toBe("col(a,x)");
    });
    it("gives the new child an equal share and scales the others", () => {
      const t = insert<string>({ type: "split", direction: "row", sizes: [0.68, 0.32], children: [leaf("a"), leaf("b")] }, "b", leaf("x"), "after");
      expect(t.type === "split" && t.sizes!.map((s) => +s.toFixed(4))).toEqual([0.4533, 0.2133, 0.3333]);
    });
    it("throws for a missing target", () => {
      expect(() => insert(leaf("a"), "z", leaf("x"), "after")).toThrow();
    });
  });

  describe("move (future drag and drop)", () => {
    it("reorders within a row", () => {
      expect(show(move(row(leaf("a"), leaf("b"), leaf("c")), "a", "c", "after"))).toBe("row(b,c,a)");
    });
    it("moves a panel under another", () => {
      expect(show(move(row(leaf("a"), leaf("b"), leaf("c")), "c", "a", "below"))).toBe("row(col(a,c),b)");
    });
    it("moving out of a stack collapses it", () => {
      expect(show(move(row(column(leaf("a"), leaf("c")), leaf("b")), "c", "b", "after"))).toBe("row(a,b,c)");
    });
    it("is a no-op onto itself", () => {
      const t = row(leaf("a"), leaf("b"));
      expect(move(t, "a", "a", "after")).toBe(t);
    });
  });

  it("replaces a leaf in place", () => {
    expect(show(replaceLeaf(row(leaf("a"), leaf("b")), "a", leaf("z")))).toBe("row(z,b)");
    expect(show(replaceLeaf(row(leaf("a"), leaf("b")), "a", row(leaf("y"), leaf("z"))))).toBe("row(y,z,b)");
  });

  it("fills sizes from a policy, keeping explicit sizes", () => {
    const t = withSizes(row(leaf("a"), column(leaf("b"), leaf("c"))), (s) => s.children.map(() => 1));
    expect(t.type === "split" && t.sizes).toEqual([0.5, 0.5]);
    const kept = withSizes<string>({ type: "split", direction: "row", sizes: [0.7, 0.3], children: [leaf("a"), leaf("b")] }, () => [1, 1]);
    expect(kept.type === "split" && kept.sizes).toEqual([0.7, 0.3]);
  });
});
