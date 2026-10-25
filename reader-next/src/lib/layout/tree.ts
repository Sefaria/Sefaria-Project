/**
 * A layout tree: how things are arranged on screen, independent of what they are. Used for panels in the
 * workspace and for side panels inside a panel (docs/WORKSPACE.md). All functions are pure and return new
 * trees; ids are opaque strings.
 *
 * Invariants kept by every operation (and restored by `normalize`):
 *  - a split has at least two children (a one-child split is replaced by its child);
 *  - a split's child is never a split in the same direction (it is flattened into the parent);
 *  - `sizes`, when present, has one positive entry per child and sums to 1.
 */
export type Direction = "row" | "column";

export type LayoutNode<Id extends string = string> =
  | { type: "leaf"; id: Id }
  | { type: "split"; direction: Direction; children: LayoutNode<Id>[]; sizes?: number[] };

export type Placement = "before" | "after" | "above" | "below";

export const leaf = <Id extends string>(id: Id): LayoutNode<Id> => ({ type: "leaf", id });
export const row = <Id extends string>(...children: LayoutNode<Id>[]): LayoutNode<Id> => normalize({ type: "split", direction: "row", children });
/** A split with explicit sizes (fractions, rescaled to sum to 1). */
export const split = <Id extends string>(direction: Direction, children: LayoutNode<Id>[], sizes?: number[]): LayoutNode<Id> =>
  normalize({ type: "split", direction, children, ...(sizes ? { sizes: rescale(sizes) } : {}) });
export const column = <Id extends string>(...children: LayoutNode<Id>[]): LayoutNode<Id> => normalize({ type: "split", direction: "column", children });

/** Leaf ids in reading order (depth first, left to right / top to bottom). */
export function leaves<Id extends string>(node: LayoutNode<Id> | null): Id[] {
  if (!node) return [];
  return node.type === "leaf" ? [node.id] : node.children.flatMap((c) => leaves(c));
}

export const contains = <Id extends string>(node: LayoutNode<Id> | null, id: Id): boolean => leaves(node).includes(id);

function rescale(sizes: number[] | undefined): number[] | undefined {
  if (!sizes) return undefined;
  const total = sizes.reduce((a, b) => a + b, 0);
  return total > 0 ? sizes.map((s) => s / total) : undefined;
}

/** Restore the invariants (see module doc). */
export function normalize<Id extends string>(node: LayoutNode<Id>): LayoutNode<Id> {
  if (node.type === "leaf") return node;
  const children: LayoutNode<Id>[] = [];
  const sizes: number[] = [];
  node.children.forEach((raw, i) => {
    const c = normalize(raw);
    const share = node.sizes?.[i] ?? 1 / node.children.length;
    if (c.type === "split" && c.direction === node.direction) {
      c.children.forEach((cc, j) => {
        children.push(cc);
        sizes.push(share * (c.sizes?.[j] ?? 1 / c.children.length));
      });
    } else {
      children.push(c);
      sizes.push(share);
    }
  });
  if (children.length === 1) return children[0]!;
  return { type: "split", direction: node.direction, children, ...(node.sizes ? { sizes: rescale(sizes) } : {}) };
}

/** Remove a leaf. Its share of space goes to its siblings. Returns null when nothing is left. */
export function remove<Id extends string>(node: LayoutNode<Id>, id: Id): LayoutNode<Id> | null {
  if (node.type === "leaf") return node.id === id ? null : node;
  const kept: { child: LayoutNode<Id>; size?: number }[] = [];
  node.children.forEach((c, i) => {
    const r = remove(c, id);
    if (r) kept.push({ child: r, size: node.sizes?.[i] });
  });
  if (kept.length === 0) return null;
  return normalize({
    type: "split",
    direction: node.direction,
    children: kept.map((k) => k.child),
    ...(node.sizes ? { sizes: rescale(kept.map((k) => k.size ?? 0)) } : {}),
  });
}

const directionOf = (p: Placement): Direction => (p === "before" || p === "after" ? "row" : "column");
const isAfter = (p: Placement) => p === "after" || p === "below";

/**
 * Put `node` next to the leaf `target`: before/after it in a row, or above/below it in a column. If the target
 * already sits in a split of that direction the node joins it (taking an equal share); otherwise the target is
 * wrapped in a new split. Sizes of an existing split are kept for the others and scaled to fit.
 */
export function insert<Id extends string>(tree: LayoutNode<Id>, target: Id, node: LayoutNode<Id>, placement: Placement): LayoutNode<Id> {
  const dir = directionOf(placement);
  const after = isAfter(placement);
  function visit(n: LayoutNode<Id>): LayoutNode<Id> {
    if (n.type === "leaf") {
      if (n.id !== target) return n;
      return { type: "split", direction: dir, children: after ? [n, node] : [node, n] };
    }
    const idx = n.children.findIndex((c) => c.type === "leaf" && c.id === target);
    if (idx >= 0 && n.direction === dir) return spliceChild(n, after ? idx + 1 : idx, node);
    return { ...n, children: n.children.map(visit) };
  }
  if (!contains(tree, target)) throw new Error(`insert: no leaf ${target}`);
  return normalize(visit(tree));
}

/** A split with `node` added at `at`, taking an equal share; the others' shares are scaled to fit. */
function spliceChild<Id extends string>(n: Extract<LayoutNode<Id>, { type: "split" }>, at: number, node: LayoutNode<Id>): LayoutNode<Id> {
  const children = [...n.children];
  children.splice(at, 0, node);
  if (!n.sizes) return { ...n, children };
  const share = 1 / children.length;
  const sizes = n.sizes.map((s) => s * (1 - share));
  sizes.splice(at, 0, share);
  return { ...n, children, sizes };
}

/**
 * Put `node` beside the whole block holding `target` in the outermost split of the placement's direction, rather than right
 * next to the leaf: a panel opened from a stacked panel goes beside the stack at full height instead of splitting the stack's
 * cell into a row. A target that is a direct child of that split behaves exactly as {@link insert}.
 */
export function insertBeside<Id extends string>(tree: LayoutNode<Id>, target: Id, node: LayoutNode<Id>, placement: Placement): LayoutNode<Id> {
  if (!contains(tree, target)) throw new Error(`insertBeside: no leaf ${target}`);
  const dir = directionOf(placement);
  const after = isAfter(placement);
  if (tree.type === "leaf") return insert(tree, target, node, placement);
  if (tree.direction !== dir) return normalize({ type: "split", direction: dir, children: after ? [tree, node] : [node, tree] });
  const idx = tree.children.findIndex((c) => contains(c, target));
  if (tree.children[idx]!.type === "leaf") return insert(tree, target, node, placement);
  return normalize(spliceChild(tree, after ? idx + 1 : idx, node));
}

/** Whether two trees arrange the same leaves the same way (sizes aside). */
export function sameShape<Id extends string>(a: LayoutNode<Id>, b: LayoutNode<Id>): boolean {
  if (a.type === "leaf" || b.type === "leaf") return a.type === b.type && (a as { id: Id }).id === (b as { id: Id }).id;
  return a.direction === b.direction && a.children.length === b.children.length && a.children.every((c, i) => sameShape(c, b.children[i]!));
}

/** Exchange the places of two leaves, sizes and all. */
export function swap<Id extends string>(tree: LayoutNode<Id>, a: Id, b: Id): LayoutNode<Id> {
  if (a === b) return tree;
  if (!contains(tree, a) || !contains(tree, b)) throw new Error(`swap: no leaf ${contains(tree, a) ? b : a}`);
  const visit = (n: LayoutNode<Id>): LayoutNode<Id> =>
    n.type === "leaf" ? (n.id === a ? leaf(b) : n.id === b ? leaf(a) : n) : { ...n, children: n.children.map(visit) };
  return visit(tree);
}

/** Move a leaf to one end of the whole arrangement, spanning its full height (`before`/`after`) or width (`above`/`below`). */
export function dock<Id extends string>(tree: LayoutNode<Id>, id: Id, placement: Placement): LayoutNode<Id> {
  if (!contains(tree, id)) throw new Error(`dock: no leaf ${id}`);
  const without = remove(tree, id);
  if (!without) return tree;
  const dir = directionOf(placement);
  const after = isAfter(placement);
  if (without.type === "split" && without.direction === dir) return normalize(spliceChild(without, after ? without.children.length : 0, leaf(id)));
  return normalize({ type: "split", direction: dir, children: after ? [without, leaf(id)] : [leaf(id), without] });
}

/** Move an existing leaf next to another (drag and drop). Moving a leaf onto itself is a no-op. */
export function move<Id extends string>(tree: LayoutNode<Id>, id: Id, target: Id, placement: Placement): LayoutNode<Id> {
  if (id === target) return tree;
  if (!contains(tree, id)) throw new Error(`move: no leaf ${id}`);
  const without = remove(tree, id);
  if (!without) return tree;
  return insert(without, target, leaf(id), placement);
}

/** Swap a leaf for another node (e.g. replace a panel with a new one in the same place). */
export function replaceLeaf<Id extends string>(tree: LayoutNode<Id>, id: Id, node: LayoutNode<Id>): LayoutNode<Id> {
  const visit = (n: LayoutNode<Id>): LayoutNode<Id> =>
    n.type === "leaf" ? (n.id === id ? node : n) : { ...n, children: n.children.map(visit) };
  return normalize(visit(tree));
}

/** Fill in missing `sizes` with a policy (given the leaf ids of each split's children, in order). */
export function withSizes<Id extends string>(tree: LayoutNode<Id>, policy: (split: Extract<LayoutNode<Id>, { type: "split" }>) => number[] | undefined): LayoutNode<Id> {
  if (tree.type === "leaf") return tree;
  const children = tree.children.map((c) => withSizes(c, policy));
  const self = { ...tree, children };
  const sizes = tree.sizes ?? rescale(policy(self));
  return sizes ? { ...self, sizes } : self;
}

/** Set the sizes of the split reached by `path` (child indexes from the root). */
export function setSizesAt<Id extends string>(tree: LayoutNode<Id>, path: readonly number[], sizes: number[]): LayoutNode<Id> {
  if (tree.type === "leaf") return tree;
  if (!path.length) return sizes.length === tree.children.length ? { ...tree, sizes: rescale(sizes) } : tree;
  const [head, ...rest] = path;
  return { ...tree, children: tree.children.map((c, i) => (i === head ? setSizesAt(c, rest, sizes) : c)) };
}
