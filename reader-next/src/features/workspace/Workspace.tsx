import { useLocation } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { leaves, setSizesAt, withSizes, type LayoutNode } from "~/lib/layout/tree";
import { urlToRef } from "~/lib/ref/url";
import { legacyRowSizes, MIN_PANEL_HEIGHT, panelMinWidth } from "~/lib/workspace/sizing";
import type { PanelId, PanelState } from "~/lib/workspace/types";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { dirOf, useInterfaceLang } from "~/lib/i18n/interface-lang";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { SplitView } from "~/ui/SplitView/SplitView";
import type { WorkspaceRouteData } from "../reader/reader-route";
import { TextPanel } from "../reader/TextPanel";
import styles from "./Workspace.module.css";
import { readNavState, useWorkspaceNav, WorkspaceNavProvider } from "./navigation";
import { PanelDrag } from "./PanelDrag";

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
  const scrollerEl = useRef<HTMLDivElement>(null);
  const navState = readNavState(location.state);
  useOverflowHints(mainEl, scrollerEl);
  useRevealOpenedPanel(mainEl, navState.nav === "go" ? navState.panel : undefined, order.length);

  if (!layout) return null;
  return (
    <WorkspaceNavProvider>
      <main ref={mainEl} className={styles.workspace}>
        <div ref={scrollerEl} className={styles.scroller}>
          <Panels layout={layout as LayoutNode<PanelId>} panels={ws.panels} label={order.length > 1 ? "Open texts" : undefined} renderLeaf={(id) => <PanelHost panel={ws.panels[id]!} data={data} innerSizes={sizes.inner[order.indexOf(id)]} alone={order.length === 1} />} />
        </div>
        <PanelDrag scroller={scrollerEl} layout={ws.layout} panels={ws.panels} />
      </main>
    </WorkspaceNavProvider>
  );
}

/**
 * The panels' split view; a dragged divider writes the new shares into the URL's layout. The arrangement is the same in
 * both interface languages (panel 1 on the left); only what is inside a panel follows the interface's direction. The
 * workspace, not a split inside it, scrolls sideways.
 */
function Panels({ layout, panels, label, renderLeaf }: { layout: LayoutNode<PanelId>; panels: Record<PanelId, PanelState>; label?: string; renderLeaf: (id: PanelId) => React.ReactNode }) {
  const nav = useWorkspaceNav();
  const leafDir = dirOf(useInterfaceLang());
  return (
    <SplitView<PanelId>
      node={layout}
      dir="ltr"
      leafDir={leafDir}
      parentScrolls
      minLeafSize={(id, dir) => (dir === "row" ? panelMinWidth(panels[id]) : MIN_PANEL_HEIGHT)}
      label={label}
      renderLeaf={renderLeaf}
      onResize={(path, shares) => nav.go({ ...nav.current(), layout: setSizesAt(layout, path, shares) }, { replace: true, state: { nav: "stay" } })}
    />
  );
}

/** Marks the workspace when panels are hidden past its left or right edge, for the edge shadows. */
function useOverflowHints(mainEl: React.RefObject<HTMLElement | null>, scrollerEl: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const main = mainEl.current;
    const scroller = scrollerEl.current;
    if (!main || !scroller || typeof ResizeObserver === "undefined") return;
    let content: Element | null = null;
    const update = () => {
      const el = scroller.firstElementChild;
      if (el && el !== content) ro.observe(el);
      content = el;
      const hidden = scroller.scrollWidth - scroller.clientWidth;
      main.toggleAttribute("data-more-start", hidden > 1 && scroller.scrollLeft > 1);
      main.toggleAttribute("data-more-end", hidden > 1 && scroller.scrollLeft < hidden - 1);
    };
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    const mo = new MutationObserver(update);
    mo.observe(scroller, { childList: true });
    scroller.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      ro.disconnect();
      mo.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, [mainEl, scrollerEl]);
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
