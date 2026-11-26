/**
 * The workspace as a surface sees it (SurfaceHost v1): text panels only. Asset panels (SHL-093) are not part of contract 1.x — a surface
 * pinned to it reads `panel.ref` on every panel — so the host hands surfaces the workspace without them, and puts them back when a
 * surface navigates to a workspace it built from that view (each asset beside the text panel it is linked to, which keeps its stable
 * key). A surface that replaces the workspace outright (one text on its own) closes the assets with the texts they followed.
 *
 * The address and the reader state snapshots still carry asset panels (`a<n>`), so a followed leader's or a replayed reader's assets
 * open for whoever follows: only the typed workspace objects are filtered.
 *
 * @feature SHL-093 Asset panel
 */
import { leaves, remove } from "~/lib/layout/tree";
import type { WorkspaceCommands } from "~/lib/workspace/commands";
import { openNextToWithId, panelOrder } from "~/lib/workspace/ops";
import type { PanelId, PanelState, TextPanelState, Workspace } from "~/lib/workspace/types";

/** A workspace with text panels only. */
export interface SurfaceWorkspace extends Omit<Workspace, "panels"> {
  panels: Record<PanelId, TextPanelState>;
}

/** The workspace without its asset panels (renumbered as the address would number them). */
export function textOnly(ws: Workspace): SurfaceWorkspace {
  if (!Object.values(ws.panels).some((p) => p.kind !== "text")) return ws as SurfaceWorkspace;
  let layout = ws.layout;
  for (const id of panelOrder(ws)) if (ws.panels[id]!.kind !== "text" && layout) layout = remove(layout, id);
  const order = layout ? leaves(layout) : [];
  const map = new Map(order.map((id, i) => [id, `p${i + 1}` as PanelId]));
  const panels: Record<PanelId, TextPanelState> = {};
  for (const id of order) {
    const p = ws.panels[id] as TextPanelState;
    const { link, ...rest } = p;
    const to = link ? map.get(link.to) : undefined;
    panels[map.get(id)!] = { ...rest, id: map.get(id)!, asides: rest.asides.map((a) => ({ ...a, id: a.id.replace(/^p\d+/, map.get(id)!) as typeof a.id })), ...(link && to ? { link: { ...link, to } } : {}) };
  }
  return { ...ws, panels, layout: layout ? renameLayout(layout, map) : null };
}

function renameLayout(node: NonNullable<Workspace["layout"]>, map: Map<PanelId, PanelId>): NonNullable<Workspace["layout"]> {
  return node.type === "leaf" ? { type: "leaf", id: map.get(node.id) ?? node.id } : { ...node, children: node.children.map((c) => renameLayout(c, map)) };
}

/**
 * A workspace a surface built from the text-only view, with the current workspace's asset panels put back beside the text panels they
 * follow (found by stable key, else by ref). Assets whose text is gone are dropped.
 */
export function withAssetsFrom(next: Workspace, current: Workspace): Workspace {
  const assets = panelOrder(current)
    .map((id) => current.panels[id]!)
    .filter((p): p is Extract<PanelState, { kind: "asset" }> => p.kind === "asset" && !!p.link);
  let ws = next;
  for (const a of assets) {
    const leader = current.panels[a.link!.to];
    if (!leader || leader.kind !== "text") continue;
    const target = panelOrder(ws).find((id) => {
      const p = ws.panels[id]!;
      return p.kind === "text" && (leader.key ? p.key === leader.key : p.ref === leader.ref);
    });
    if (!target) continue;
    const { id: _id, asides: _asides, link: _link, ...rest } = a;
    const [opened, newId] = openNextToWithId(ws, target, { ...rest, asides: [] });
    ws = { ...opened, panels: { ...opened.panels, [newId]: { ...opened.panels[newId]!, link: { to: target }, ...(a.key ? { key: a.key } : {}) } } };
    // the text may have been renumbered by the insert: point the link at it again by key or ref
    const leaderNow = panelOrder(ws).find((id) => {
      const p = ws.panels[id]!;
      return p.kind === "text" && (leader.key ? p.key === leader.key : p.ref === leader.ref);
    });
    if (leaderNow) ws = { ...ws, panels: { ...ws.panels, [newId]: { ...ws.panels[newId]!, link: { to: leaderNow } } } };
  }
  return ws;
}

/** Workspace commands for a surface: the text-only view, with the asset panels kept across a surface's navigation. */
export function surfaceCommands(c: WorkspaceCommands): SurfaceCommands {
  return {
    current: () => textOnly(c.current()),
    go: (ws, opts) => c.go(withAssetsFrom(ws as Workspace, c.current()), opts),
    href: (ws) => c.href(withAssetsFrom(ws as Workspace, c.current())),
    canonicalize: c.canonicalize,
  };
}
export interface SurfaceCommands extends Omit<WorkspaceCommands, "current"> {
  current: () => SurfaceWorkspace;
}
