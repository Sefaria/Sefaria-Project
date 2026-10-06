import { useLocation } from "@tanstack/react-router";
import { Suspense, useMemo } from "react";
import { leaves, withSizes, type LayoutNode } from "~/lib/layout/tree";
import { urlToRef } from "~/lib/ref/url";
import { legacyRowSizes, MIN_PANEL_WIDTH } from "~/lib/workspace/sizing";
import type { PanelId, PanelState } from "~/lib/workspace/types";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { LoadingState } from "~/ui/Feedback/Feedback";
import { SplitView } from "~/ui/SplitView/SplitView";
import type { WorkspaceRouteData } from "../reader/reader-route";
import { TextPanel } from "../reader/TextPanel";
import styles from "./Workspace.module.css";
import { WorkspaceNavProvider } from "./navigation";

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

  if (!layout) return null;
  return (
    <WorkspaceNavProvider>
      <main className={styles.workspace}>
        <SplitView<PanelId>
          node={layout as LayoutNode<PanelId>}
          minLeafSize={MIN_PANEL_WIDTH}
          label={order.length > 1 ? "Open texts" : undefined}
          renderLeaf={(id) => <PanelHost panel={ws.panels[id]!} data={data} innerSizes={sizes.inner[order.indexOf(id)]} alone={order.length === 1} />}
        />
      </main>
    </WorkspaceNavProvider>
  );
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
