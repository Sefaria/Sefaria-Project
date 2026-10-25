import { describe, expect, it } from "vitest";
import { column, leaf, row, split, setSizesAt, type LayoutNode } from "~/lib/layout/tree";
import type { PanelId } from "./types";
import { decodeLayout, encodeLayout } from "./layout-param";
import { decodeWorkspace, encodeWorkspace } from "./url";

const l = (n: number) => leaf(`p${n}` as PanelId);

describe("layout parameter", () => {
  it("is absent for the old reader's plain row", () => {
    expect(encodeLayout(l(1))).toBeUndefined();
    expect(encodeLayout(row(l(1), l(2)))).toBeUndefined();
  });

  it("round-trips stacked panels with shares", () => {
    const tree = split("row", [column(l(1), l(2)), l(3)], [1, 2]);
    const text = encodeLayout(tree);
    expect(text).toBe("r(c(1,2)~33.3,3~66.7)");
    const back = decodeLayout(text, 3) as Extract<LayoutNode<PanelId>, { type: "split" }>;
    expect(back.children[0]).toEqual(column(l(1), l(2)));
    expect(back.sizes?.[1]).toBeCloseTo(0.667, 3);
    expect(decodeLayout("r(c(1,2)~33,3~67)", 3)).toBeDefined(); // whole percentages read too
  });

  it("never writes a share as 0, which would make the split's shares unreadable", () => {
    expect(encodeLayout(split("row", [l(1), l(2)], [0.0001, 1]))).toBe("r(1~0.1,2~100)");
  });

  it("ignores malformed values and ones that number panels out of reading order", () => {
    expect(decodeLayout("r(1,", 2)).toBeUndefined();
    expect(decodeLayout("r(2,1)", 2)).toBeUndefined();
    expect(decodeLayout("r(1,1)", 2)).toBeUndefined();
  });

  it("fits a parameter written for a different number of panels: drops panels that are gone, appends new ones to the row", () => {
    expect(encodeLayout(decodeLayout("r(c(1,2),3)", 2)!)).toBe("c(1,2)");
    expect(encodeLayout(decodeLayout("r(c(1,2)~40,3~60)", 4)!)).toBe("r(c(1,2)~26.7,3~40,4~33.3)");
    expect(encodeLayout(decodeLayout("c(1,2)", 3)!)).toBe("r(c(1,2),3)");
  });

  it("travels through the workspace URL", () => {
    const ws = decodeWorkspace("Rashi on Berakhot 2a", { p2: "Tosafot_on_Berakhot.2a", p3: "Berakhot.2a", layout: "r(c(1,2)~33,3~67)" });
    expect(ws.layout?.type === "split" && ws.layout.direction).toBe("row");
    expect(encodeWorkspace(ws)?.search.layout).toBe("r(c(1,2)~33,3~67)");
  });

  it("setSizesAt changes one split", () => {
    const tree = row(column(l(1), l(2)), l(3));
    const next = setSizesAt(tree, [0], [3, 1]) as Extract<LayoutNode<PanelId>, { type: "split" }>;
    expect((next.children[0] as Extract<LayoutNode<PanelId>, { type: "split" }>).sizes).toEqual([0.75, 0.25]);
  });
});
