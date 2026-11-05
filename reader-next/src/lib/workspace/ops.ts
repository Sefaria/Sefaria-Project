/**
 * Operations on a workspace. Pure: each returns a new workspace (docs/WORKSPACE.md, "Pure operations").
 *
 * @feature SHL-043 Open text (replace all panels)
 * @feature SHL-044 Open panel at position
 * @feature SHL-047 Open connections list at panel
 * @feature SHL-048 Close panel
 */
import { insert, leaf, leaves, move as moveLeaf, remove, type LayoutNode, type Placement } from "~/lib/layout/tree";
import type { AsideId, AsideState, PanelId, PanelState, Workspace } from "./types";

/** A panel as the caller describes it: ids are assigned by the workspace. */
export type NewPanel = DistributiveOmit<PanelState, "id" | "asides"> & { asides?: Omit<AsideState, "id">[] };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export const panelOrder = (ws: Workspace): PanelId[] => leaves(ws.layout);
export const panelAt = (ws: Workspace, index: number): PanelState | undefined => {
  const id = panelOrder(ws)[index];
  return id ? ws.panels[id] : undefined;
};

/** A layout with its leaf ids renamed. */
function renameLeaves<Id extends string>(node: LayoutNode<Id>, name: (id: Id) => Id): LayoutNode<Id> {
  return node.type === "leaf" ? { type: "leaf", id: name(node.id) } : { ...node, children: node.children.map((c) => renameLeaves(c, name)) };
}

/**
 * Ids follow position, as the URL does (p1, p2, … in reading order; a panel's side panels p<n>a<m>). Every operation that changes
 * the order renumbers, so a workspace and the one read back from its URL name the same panel the same way (a navigation that
 * targets a panel by id reaches the right one).
 */
export function renumber(ws: Workspace): Workspace {
  if (!ws.layout) return ws;
  const order = panelOrder(ws);
  const map = new Map(order.map((id, i) => [id, `p${i + 1}` as PanelId]));
  if (order.every((id) => map.get(id) === id)) return ws;
  const panels: Record<PanelId, PanelState> = {};
  for (const id of order) {
    const p = ws.panels[id]!;
    const nid = map.get(id)!;
    const asideMap = new Map(p.asides.map((a) => [a.id, a.id.replace(/^p\d+/, nid) as AsideId]));
    panels[nid] = {
      ...p,
      id: nid,
      asides: p.asides.map((a) => ({ ...a, id: asideMap.get(a.id)! })),
      ...(p.asideLayout ? { asideLayout: renameLeaves(p.asideLayout, (x) => asideMap.get(x as AsideId) ?? x) } : {}),
    } as PanelState;
  }
  return { panels, layout: renameLeaves(ws.layout, (id) => map.get(id) ?? id) };
}

function materialise(id: PanelId, p: NewPanel): PanelState {
  return { ...p, id, asides: (p.asides ?? []).map((a, i) => ({ ...a, id: `${id}a${i + 1}` as AsideId })) } as PanelState;
}

/** Open a panel on its own, replacing everything (header search, top-level links). */
export function openOnly(_ws: Workspace, p: NewPanel): Workspace {
  const id: PanelId = "p1";
  return { panels: { [id]: materialise(id, p) }, layout: leaf(id) };
}

/** Open a panel next to another one (default: after it, in the same row). Opening into an empty workspace opens it alone. */
export function openNextTo(ws: Workspace, target: PanelId | null, p: NewPanel, placement: Placement = "after"): Workspace {
  return openNextToWithId(ws, target, p, placement)[0];
}

/** {@link openNextTo}, also returning the new panel's id (after renumbering). */
export function openNextToWithId(ws: Workspace, target: PanelId | null, p: NewPanel, placement: Placement = "after"): [Workspace, PanelId] {
  if (!ws.layout || !target || !ws.panels[target]) {
    if (!ws.layout) return [openOnly(ws, p), "p1"];
    const last = panelOrder(ws).at(-1)!;
    return openNextToWithId(ws, last, p, placement);
  }
  const tmp = "p0" as PanelId; // a temporary id no panel has: renumbering gives the new panel its place's id
  const layout = insert(ws.layout, target, leaf(tmp), placement);
  const id = `p${leaves(layout).indexOf(tmp) + 1}` as PanelId;
  return [renumber({ panels: { ...ws.panels, [tmp]: materialise(tmp, p) }, layout }), id];
}

/** Open a panel after the last one (old `openPanelAtEnd`). */
export const openAtEnd = (ws: Workspace, p: NewPanel): Workspace => openNextTo(ws, panelOrder(ws).at(-1) ?? null, p);

/** Put a different panel in the same place. The new panel gets a new id (it is a different thing). */
export function replace(ws: Workspace, target: PanelId, p: NewPanel): Workspace {
  if (!ws.layout || !ws.panels[target]) return ws;
  // the new panel takes the old one's place, so (ids following position) its id too
  const { [target]: _gone, ...rest } = ws.panels;
  return { panels: { ...rest, [target]: materialise(target, p) }, layout: ws.layout };
}

/** Close a panel; its side panels close with it. Closing the last panel leaves an empty workspace (→ home). */
export function close(ws: Workspace, target: PanelId): Workspace {
  if (!ws.layout || !ws.panels[target]) return ws;
  const { [target]: _gone, ...rest } = ws.panels;
  return renumber({ panels: rest, layout: remove(ws.layout, target) });
}

/** Change a panel's own fields (ref, versions, language…). */
export function updatePanel(ws: Workspace, target: PanelId, patch: Partial<Omit<PanelState, "id" | "kind" | "asides">>): Workspace {
  const p = ws.panels[target];
  if (!p) return ws;
  return { ...ws, panels: { ...ws.panels, [target]: { ...p, ...patch } as PanelState } };
}

/** Rearrange (future drag and drop): put a panel before/after/above/below another. */
export function move(ws: Workspace, id: PanelId, target: PanelId, placement: Placement): Workspace {
  if (!ws.layout || !ws.panels[id] || !ws.panels[target]) return ws;
  return renumber({ ...ws, layout: moveLeaf(ws.layout, id, target, placement) });
}

// ── side panels ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Open a side panel on a panel. The old reader allowed one sidebar per text; `replaceExisting` (the default)
 * keeps that behaviour by changing the existing aside of the same kind instead of adding a second one.
 */
export function openAside(ws: Workspace, target: PanelId, a: Omit<AsideState, "id">, opts: { replaceExisting?: boolean } = {}): Workspace {
  const p = ws.panels[target];
  if (!p) return ws;
  const existing = p.asides.find((x) => x.kind === a.kind);
  if (existing && opts.replaceExisting !== false) {
    // Replace, don't merge: fields of the old view (a previewed version) must not linger in the new one. The
    // side panel's own language is the one thing that carries over.
    const next: AsideState = { id: existing.id, ...a, ...(a.lang === undefined && existing.lang ? { lang: existing.lang } : {}) };
    return { ...ws, panels: { ...ws.panels, [target]: { ...p, asides: p.asides.map((x) => (x.id === existing.id ? next : x)) } } };
  }
  let n = 1;
  while (p.asides.some((x) => x.id === `${target}a${n}`)) n++;
  const aside: AsideState = { ...a, id: `${target}a${n}` as AsideId };
  return { ...ws, panels: { ...ws.panels, [target]: { ...p, asides: [...p.asides, aside], asideLayout: undefined } } };
}

export function updateAside(ws: Workspace, target: PanelId, asideId: AsideId, patch: Partial<Omit<AsideState, "id">>): Workspace {
  const p = ws.panels[target];
  if (!p || !p.asides.some((a) => a.id === asideId)) return ws;
  return { ...ws, panels: { ...ws.panels, [target]: { ...p, asides: p.asides.map((a) => (a.id === asideId ? { ...a, ...patch } : a)) } } };
}

export function closeAside(ws: Workspace, target: PanelId, asideId?: AsideId): Workspace {
  const p = ws.panels[target];
  if (!p) return ws;
  const asides = asideId ? p.asides.filter((a) => a.id !== asideId) : [];
  const asideLayout = p.asideLayout && asideId ? (remove(p.asideLayout, asideId) ?? undefined) : undefined;
  return { ...ws, panels: { ...ws.panels, [target]: { ...p, asides, asideLayout } } };
}
