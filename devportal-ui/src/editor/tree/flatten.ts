// The page tree as a flat list for sorting, and where a drag drops (the dnd-kit sortable-tree projection: the
// pointer's horizontal offset chooses the depth among those the neighbours allow).
import type { EditorTreeNode } from '../../contracts';

export interface FlatNode {
  id: number;
  parentId: number | null;
  depth: number;
  index: number;
  node: EditorTreeNode;
}

export function flatten(nodes: readonly EditorTreeNode[], collapsed: ReadonlySet<number> = new Set()): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (list: readonly EditorTreeNode[], parentId: number | null, depth: number) => {
    list.forEach((node, index) => {
      out.push({ id: node.id, parentId, depth, index, node });
      if (!collapsed.has(node.id)) walk(node.children, node.id, depth + 1);
    });
  };
  walk(nodes, null, 0);
  return out;
}

function descendants(flat: readonly FlatNode[], id: number): Set<number> {
  const out = new Set<number>([id]);
  for (const item of flat) if (item.parentId !== null && out.has(item.parentId)) out.add(item.id);
  return out;
}

export interface Projection {
  parentId: number | null;
  position: number;
  depth: number;
}

/**
 * Where `activeId` lands when dropped over `overId` with a horizontal offset of `offsetX` pixels (`indent` per
 * level). Returns null when nothing would change. The server still validates the move (kinds, depth, section).
 */
export function projectMove(
  flat: readonly FlatNode[],
  activeId: number,
  overId: number,
  offsetX: number,
  indent = 20
): Projection | null {
  const moving = descendants(flat, activeId);
  const active = flat.find((f) => f.id === activeId);
  if (!active) return null;
  // The list without the moved subtree, with the active item placed at the over item's slot.
  const rest = flat.filter((f) => !moving.has(f.id) || f.id === activeId);
  const from = rest.findIndex((f) => f.id === activeId);
  const to = rest.findIndex((f) => f.id === overId);
  if (from < 0 || to < 0) return null;
  const ordered = [...rest];
  const [item] = ordered.splice(from, 1);
  if (!item) return null;
  ordered.splice(to, 0, item);
  const at = ordered.indexOf(item);
  const previous = ordered[at - 1];
  const next = ordered[at + 1];
  const wanted = active.depth + Math.round(offsetX / indent);
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, wanted));

  let parentId: number | null = null;
  if (depth > 0 && previous) {
    if (depth === previous.depth) parentId = previous.parentId;
    else if (depth > previous.depth) parentId = previous.id;
    else {
      const ancestor = ordered
        .slice(0, at)
        .reverse()
        .find((f) => f.depth === depth);
      parentId = ancestor ? ancestor.parentId : null;
    }
  }
  const position = ordered.slice(0, at).filter((f) => f.parentId === parentId && f.id !== activeId).length;
  if (parentId === active.parentId && position === active.index) return null;
  return { parentId, position, depth };
}

export function findNode(
  nodes: readonly EditorTreeNode[],
  predicate: (n: EditorTreeNode) => boolean
): EditorTreeNode | null {
  for (const node of nodes) {
    if (predicate(node)) return node;
    const found = findNode(node.children, predicate);
    if (found) return found;
  }
  return null;
}
