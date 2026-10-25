import { useLocation } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { leaves, setSizesAt, withSizes, type LayoutNode } from "~/lib/layout/tree";
import { urlToRef } from "~/lib/ref/url";
import { legacyRowSizes, MIN_PANEL_HEIGHT, panelMinWidth } from "~/lib/workspace/sizing";
import type { PanelId, PanelState } from "~/lib/workspace/types";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { SplitView } from "~/ui/SplitView/SplitView";
import type { WorkspaceRouteData } from "../reader/reader-route";
import { TextPanel } from "../reader/TextPanel";
import styles from "./Workspace.module.css";
import { readNavState, useWorkspaceNav, WorkspaceNavProvider } from "./navigation";

/**
 * Everything on screen for a reader URL: the panels in the URL, arranged by the workspace layout and sized by
 * the old reader's rules (docs/WORKSPACE.md). Display state comes from the live URL; text data from the loader.
 *
 * @feature SHL-028 @feature SHL-039 @feature SHL-061 Single-panel (mobile) behavior differences
 */
export function Workspace({ data }: { data: WorkspaceRouteData }) {
  const location = useLocation();
  const ws = useMemo(
    () => decodeWorkspace(urlToRef(decodeURIComponent(location.pathname.replace(/^\/+/, ""))), location.search as RawSearch),
    [location.pathname, location.search],
  );
  const order = leaves(ws.layout);
  const panels = order.map((id) => ws.panels[id]!);
  const sizes = legacyRowSizes(panels);
  const layout = useMemo(() => {
    if (!ws.layout) return null;
    // A single row (everything the old reader could show) gets the old reader's widths; other shapes split evenly.
    const isRow = ws.layout.type === "split" && ws.layout.direction === "row" && ws.layout.children.every((c) => c.type === "leaf");
    return isRow ? withSizes(ws.layout, () => sizes.panels) : withSizes(ws.layout, (s) => s.children.map(() => 1));
  }, [ws.layout, sizes.panels]);

  const mainEl = useRef<HTMLElement>(null);
  const navState = readNavState(location.state);
  useOverflowHints(mainEl);
  useRevealOpenedPanel(mainEl, navState.nav === "go" ? navState.panel : undefined, order.length);

  if (!layout) return null;
  return (
    <WorkspaceNavProvider>
      <main ref={mainEl} className={styles.workspace}>
        <Panels layout={layout as LayoutNode<PanelId>} panels={ws.panels} label={order.length > 1 ? "Open texts" : undefined} renderLeaf={(id) => <PanelHost panel={ws.panels[id]!} data={data} innerSizes={sizes.inner[order.indexOf(id)]} alone={order.length === 1} />} />
      </main>
    </WorkspaceNavProvider>
  );
}

/** The panels' split view; a dragged divider writes the new shares into the URL's layout. */
function Panels({ layout, panels, label, renderLeaf }: { layout: LayoutNode<PanelId>; panels: Record<PanelId, PanelState>; label?: string; renderLeaf: (id: PanelId) => React.ReactNode }) {
  const nav = useWorkspaceNav();
  return (
    <SplitView<PanelId>
      node={layout}
      minLeafSize={(id, dir) => (dir === "row" ? panelMinWidth(panels[id]) : MIN_PANEL_HEIGHT)}
      label={label}
      renderLeaf={renderLeaf}
      onResize={(path, shares) => nav.go({ ...nav.current(), layout: setSizesAt(layout, path, shares) }, { replace: true, state: { nav: "stay" } })}
    />
  );
}

/** The workspace's outermost split, when there is one (a single panel has none). */
const outerSplit = (main: HTMLElement) => {
  const el = main.firstElementChild as HTMLElement | null;
  return el?.dataset.direction ? el : null;
};

/** Marks the workspace when panels are hidden past either end of the row, for the edge shadows. */
function useOverflowHints(mainEl: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const main = mainEl.current;
    if (!main || typeof ResizeObserver === "undefined") return;
    let row: HTMLElement | null = null;
    const update = () => {
      const el = outerSplit(main);
      if (el !== row) {
        row?.removeEventListener("scroll", update);
        el?.addEventListener("scroll", update, { passive: true });
        if (el) {
          ro.observe(el);
          mo.observe(el, { childList: true });
        }
        row = el;
      }
      // the row's length changes with its cells' widths
      for (const cell of el?.children ?? []) ro.observe(cell);
      // scrollLeft runs negative in a right-to-left row
      const scrolled = el ? Math.abs(el.scrollLeft) : 0;
      const hidden = el?.dataset.direction === "row" ? el.scrollWidth - el.clientWidth : 0;
      main.toggleAttribute("data-more-start", hidden > 1 && scrolled > 1);
      main.toggleAttribute("data-more-end", hidden > 1 && scrolled < hidden - 1);
    };
    const ro = new ResizeObserver(update);
    ro.observe(main);
    const mo = new MutationObserver(update);
    mo.observe(main, { childList: true });
    update();
    return () => {
      ro.disconnect();
      mo.disconnect();
      row?.removeEventListener("scroll", update);
    };
  }, [mainEl]);
}

/**
 * A panel that was just opened or sent somewhere scrolls into view when the row is wider than the window. One that was just
 * opened also takes keyboard focus: panels keep their React identity by position, so a panel opened in the middle of the row
 * reuses an existing component and its own mount effect does not run.
 */
function useRevealOpenedPanel(mainEl: React.RefObject<HTMLElement | null>, panel: PanelId | undefined, count: number) {
  const lastCount = useRef(count);
  useEffect(() => {
    const opened = count > lastCount.current;
    lastCount.current = count;
    if (!panel) return;
    const cell = mainEl.current?.querySelector<HTMLElement>(`[data-leaf="${panel}"]`);
    if (!cell) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    cell.scrollIntoView({ inline: "nearest", block: "nearest", behavior: smooth ? "smooth" : "auto" });
    if (opened && !cell.contains(document.activeElement)) {
      cell.querySelector<HTMLElement>('a[href], button:not([aria-disabled="true"]), input, [tabindex]:not([tabindex="-1"])')?.focus({ preventScroll: true });
    }
  }, [mainEl, panel, count]);
}

/** One panel: picks the component for its kind (more kinds — sheets, menus, search — plug in here). */
function PanelHost({ panel, data, innerSizes, alone }: { panel: PanelState; data: WorkspaceRouteData; innerSizes?: number[]; alone: boolean }) {
  const panelData = data.panels[panel.id];
  // A panel just opened while its text loads.
  if (!panelData) return <LoadingState />;
  switch (panel.kind) {
    case "text":
      return (
        <Suspense fallback={<LoadingState />}>
          <TextPanel panel={panel} data={panelData} innerSizes={innerSizes} alone={alone} />
        </Suspense>
      );
  }
}
