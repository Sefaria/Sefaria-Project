import { insertBeside, leaf, leaves, normalize, remove, type LayoutNode } from "~/lib/layout/tree";
import type { PanelId } from "./types";

/**
 * The `layout` query parameter: how panels are arranged when that is more than the old reader's plain row.
 * Panels are named by position (1 = p1), splits are `r(…)` (side by side) or `c(…)` (stacked), and a child may carry its
 * share in percent after `~` (to one decimal place). Talmud on the right, Rashi above Tosafot on the left, the Talmud at two
 * thirds: `r(c(1,2)~33,3~67)`.
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
    return share === undefined ? write(c) : `${write(c)}~${percent(share)}`;
  });
  return `${node.direction === "row" ? "r" : "c"}(${parts.join(",")})`;
}

/** A share as a percentage to one decimal place, never 0 (a 0 would make the whole split's shares unreadable). */
const percent = (share: number) => String(Math.max(0.1, Math.round(share * 1000) / 10));

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
    const m = /^\d+(\.\d+)?/.exec(param!.slice(i));
    if (!m) throw new Error("layout");
    i += m[0].length;
    return Number(m[0]);
  }
  try {
    let tree: LayoutNode<PanelId> | null = normalize(node());
    if (i !== param.length) return undefined;
    // A parameter written for a different number of panels (an address edited by hand, or a panel added by an older link):
    // panels it names that are not open are dropped, and open panels it does not name go at the end of the row.
    for (const id of leaves(tree)) if (Number(id.slice(1)) > count && tree) tree = remove(tree, id);
    if (!tree) return undefined;
    const ids = leaves(tree);
    // Panels are numbered in reading order, so the leaves must read 1, 2, 3…
    if (!ids.every((id, k) => id === `p${k + 1}`)) return undefined;
    for (let k = ids.length + 1; k <= count; k++) tree = insertBeside(tree, `p${k - 1}` as PanelId, leaf(`p${k}` as PanelId), "after");
    return tree;
  } catch {
    return undefined;
  }
}
