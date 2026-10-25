/**
 * Pixel sizes for a layout tree's splits. A split's `sizes` are fractions; these functions turn them into lengths once
 * the children no longer fit side by side and the split scrolls (docs/experiments/learning-workspace-defaults.md).
 */
import type { Direction, LayoutNode } from "./tree";

export type MinOf<Id extends string> = (id: Id, direction: Direction) => number;

/** The smallest length `node` can take along `dir`: its leaves' minimums, added up along a split of that direction. */
export function minExtent<Id extends string>(node: LayoutNode<Id>, dir: Direction, minOf: MinOf<Id>): number {
  if (node.type === "leaf") return minOf(node.id, dir);
  const each = node.children.map((c) => minExtent(c, dir, minOf));
  return node.direction === dir ? each.reduce((a, b) => a + b, 0) : Math.max(0, ...each);
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * The length of a split whose children cannot all fit: long enough that every child gets at least its minimum at its share.
 * The child that is narrowest for its share sits exactly at its minimum; the others keep their proportions to it.
 */
export function trackLength(shares: readonly number[], mins: readonly number[]): number {
  return Math.max(sum(mins), ...shares.map((s, i) => (s > 0 ? mins[i]! / s : 0)));
}

/** Whether children with these minimums overflow `available` (unknown before the split is measured: assume they fit). */
export const overflows = (mins: readonly number[], available: number | undefined): boolean => available !== undefined && sum(mins) > available + 0.5;

/**
 * Each child's minimum for this render. While the children fit, their own minimums (flex then shares out the room). Once they
 * do not, each child's share of the track: widths become pixels and the split scrolls.
 */
export function childMinimums(shares: readonly number[], mins: readonly number[], available: number | undefined): number[] {
  if (!overflows(mins, available)) return [...mins];
  const track = trackLength(shares, mins);
  return shares.map((s, i) => Math.max(mins[i]!, s * track));
}

/**
 * New child lengths after the divider before child `i` moves by `delta` px (positive: toward the end, widening child i − 1).
 *  - When the children fit (`overflowing` false), the two neighbours trade length; neither goes below its minimum.
 *  - When the split already scrolls, only child i − 1 changes and the track grows or shrinks with it, as columns in a
 *    spreadsheet do: the panels after it keep their widths and move along.
 */
export function dragDivider(lengths: readonly number[], mins: readonly number[], i: number, delta: number, overflowing: boolean): number[] {
  const next = [...lengths];
  const a = i - 1;
  if (a < 0 || i >= next.length) return next;
  if (overflowing) {
    next[a] = Math.max(mins[a]!, next[a]! + delta);
    return next;
  }
  const d = Math.min(Math.max(delta, mins[a]! - next[a]!), next[i]! - mins[i]!);
  if ((delta > 0 && d < 0) || (delta < 0 && d > 0)) return next; // already past a minimum: leave it
  next[a] = next[a]! + d;
  next[i] = next[i]! - d;
  return next;
}

/** Lengths → shares (summing to 1). */
export const toShares = (lengths: readonly number[]): number[] => {
  const total = sum(lengths);
  return total > 0 ? lengths.map((x) => x / total) : lengths.map(() => 1 / lengths.length);
};
