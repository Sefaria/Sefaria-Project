/**
 * Operations on a workspace. Pure: each returns a new workspace (docs/WORKSPACE.md, "Pure operations").
 *
 * @feature SHL-043 Open text (replace all panels)
 * @feature SHL-044 Open panel at position
 * @feature SHL-047 Open connections list at panel
 * @feature SHL-048 Close panel
 */
import { insert, leaf, leaves, move as moveLeaf, remove, replaceLeaf, type Placement } from "~/lib/layout/tree";
import type { AsideId, AsideState, PanelId, PanelState, Workspace } from "./types";

/** A panel as the caller describes it: ids are assigned by the workspace. */
export type NewPanel = DistributiveOmit<PanelState, "id" | "asides"> & { asides?: Omit<AsideState, "id">[] };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export const panelOrder = (ws: Workspace): PanelId[] => leaves(ws.layout);
export const panelAt = (ws: Workspace, index: number): PanelState | undefined => {
  const id = panelOrder(ws)[index];
  return id ? ws.panels[id] : undefined;
};

function nextPanelId(ws: Workspace): PanelId {
  let n = 1;
  while (ws.panels[`p${n}`]) n++;
  return `p${n}`;
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
  if (!ws.layout || !target || !ws.panels[target]) {
    if (!ws.layout) return openOnly(ws, p);
    const last = panelOrder(ws).at(-1)!;
    return openNextTo(ws, last, p, placement);
  }
  const id = nextPanelId(ws);
  return { panels: { ...ws.panels, [id]: materialise(id, p) }, layout: insert(ws.layout, target, leaf(id), placement) };
}

/** Open a panel after the last one (old `openPanelAtEnd`). */
export const openAtEnd = (ws: Workspace, p: NewPanel): Workspace => openNextTo(ws, panelOrder(ws).at(-1) ?? null, p);

/** Put a different panel in the same place. The new panel gets a new id (it is a different thing). */
export function replace(ws: Workspace, target: PanelId, p: NewPanel): Workspace {
  if (!ws.layout || !ws.panels[target]) return ws;
  const id = nextPanelId(ws);
  const { [target]: _gone, ...rest } = ws.panels;
  return { panels: { ...rest, [id]: materialise(id, p) }, layout: replaceLeaf(ws.layout, target, leaf(id)) };
}

/** Close a panel; its side panels close with it. Closing the last panel leaves an empty workspace (→ home). */
export function close(ws: Workspace, target: PanelId): Workspace {
  if (!ws.layout || !ws.panels[target]) return ws;
  const { [target]: _gone, ...rest } = ws.panels;
  return { panels: rest, layout: remove(ws.layout, target) };
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
  return { ...ws, layout: moveLeaf(ws.layout, id, target, placement) };
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
