import { leaf, leaves, normalize, type LayoutNode } from "~/lib/layout/tree";
import type { PanelId } from "./types";

/**
 * The `layout` query parameter: how panels are arranged when that is more than the old reader's plain row.
 * Panels are named by position (1 = p1), splits are `r(…)` (side by side) or `c(…)` (stacked), and a child may carry its
 * share in percent after `~`. Talmud on the right, Rashi above Tosafot on the left, the Talmud at two thirds:
 * `r(c(1,2)~33,3~67)`.
 */
export function encodeLayout(node: LayoutNode<PanelId> | null): string | undefined {
  if (!node || node.type === "leaf") return undefined;
  if (node.direction === "row" && !node.sizes && node.children.every((c) => c.type === "leaf")) return undefined;
  return write(node);
}

function write(node: LayoutNode<PanelId>): string {
  if (node.type === "leaf") return node.id.slice(1);
  const parts = node.children.map((c, i) => {
    const share = node.sizes?.[i];
    return share === undefined ? write(c) : `${write(c)}~${Math.round(share * 100)}`;
  });
  return `${node.direction === "row" ? "r" : "c"}(${parts.join(",")})`;
}

/** Read the parameter for a workspace of `count` panels. Anything malformed, or naming other panels, is ignored. */
export function decodeLayout(param: string | undefined, count: number): LayoutNode<PanelId> | undefined {
  if (!param) return undefined;
  let i = 0;
  const peek = () => param[i];
  function node(): LayoutNode<PanelId> {
    const c = peek();
    if (c === "r" || c === "c") {
      i += 2; // "r("
      if (param![i - 1] !== "(") throw new Error("layout");
      const children: LayoutNode<PanelId>[] = [];
      const sizes: number[] = [];
      for (;;) {
        children.push(node());
        sizes.push(peek() === "~" ? (i++, number()) : NaN);
        if (peek() === ",") i++;
        else if (peek() === ")") { i++; break; }
        else throw new Error("layout");
      }
      const sized = sizes.every((s) => s > 0);
      return { type: "split", direction: c === "r" ? "row" : "column", children, ...(sized ? { sizes: sizes.map((s) => s / sizes.reduce((a, b) => a + b, 0)) } : {}) };
    }
    return leaf(`p${number()}` as PanelId);
  }
  function number(): number {
    const m = /^\d+/.exec(param!.slice(i));
    if (!m) throw new Error("layout");
    i += m[0].length;
    return Number(m[0]);
  }
  try {
    const tree = normalize(node());
    if (i !== param.length) return undefined;
    const ids = leaves(tree);
    const expected = Array.from({ length: count }, (_, k) => `p${k + 1}`);
    // Panels are numbered in reading order, so the leaves must read 1, 2, 3…
    return ids.length === count && ids.every((id, k) => id === expected[k]) ? tree : undefined;
  } catch {
    return undefined;
  }
}
