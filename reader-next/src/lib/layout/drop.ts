/**
 * Where a dragged leaf lands: the drop zones of a target (its four edges and its centre) and of the whole arrangement's
 * left and right ends, and the layout each drop produces. Geometry is physical (left is left in every interface language).
 */
import { dock, move, sameShape, swap, type LayoutNode, type Placement } from "./tree";

export type Zone = Placement | "centre";

export type Drop<Id extends string> =
  | { kind: "beside"; target: Id; placement: Placement }
  | { kind: "swap"; target: Id }
  | { kind: "dock"; placement: Placement };

export interface Rect { left: number; top: number; width: number; height: number }

/** Share of the target's width and height, around its middle, that means "swap" rather than an edge. */
export const CENTRE = 0.4;

/** The zone of `rect` under the point: the centre box, else the nearest edge. */
export function zoneAt(rect: Rect, x: number, y: number): Zone {
  const fx = rect.width > 0 ? (x - rect.left) / rect.width : 0.5;
  const fy = rect.height > 0 ? (y - rect.top) / rect.height : 0.5;
  const lo = (1 - CENTRE) / 2;
  const hi = 1 - lo;
  if (fx >= lo && fx <= hi && fy >= lo && fy <= hi) return "centre";
  const edges: [Placement, number][] = [["before", fx], ["after", 1 - fx], ["above", fy], ["below", 1 - fy]];
  return edges.reduce((best, e) => (e[1] < best[1] ? e : best))[0];
}

/** The part of `rect` the overlay highlights for a zone: the matching half, or the whole target for a swap. */
export function zoneRect(rect: Rect, zone: Zone): Rect {
  const { left, top, width, height } = rect;
  switch (zone) {
    case "before": return { left, top, width: width / 2, height };
    case "after": return { left: left + width / 2, top, width: width / 2, height };
    case "above": return { left, top, width, height: height / 2 };
    case "below": return { left, top: top + height / 2, width, height: height / 2 };
    case "centre": return rect;
  }
}

/** The drop for a zone of a target leaf. */
export const dropFor = <Id extends string>(target: Id, zone: Zone): Drop<Id> =>
  zone === "centre" ? { kind: "swap", target } : { kind: "beside", target, placement: zone };

/** The layout after dropping leaf `id`. */
export function applyDrop<Id extends string>(tree: LayoutNode<Id>, id: Id, drop: Drop<Id>): LayoutNode<Id> {
  switch (drop.kind) {
    case "beside": return move(tree, id, drop.target, drop.placement);
    case "swap": return swap(tree, id, drop.target);
    case "dock": return dock(tree, id, drop.placement);
  }
}

/** Whether a drop would rearrange anything (a drop onto itself, or where it already is, would not). */
export const changes = <Id extends string>(tree: LayoutNode<Id>, id: Id, drop: Drop<Id>): boolean =>
  (drop.kind === "dock" || drop.target !== id) && !sameShape(applyDrop(tree, id, drop), tree);
