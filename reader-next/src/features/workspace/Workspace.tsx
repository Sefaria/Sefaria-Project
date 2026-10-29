import { useLocation } from "@tanstack/react-router";
import { Suspense, useMemo } from "react";
import { leaves, withSizes, type LayoutNode } from "~/lib/layout/tree";
import { urlToRef } from "~/lib/ref/url";
import { legacyRowSizes, MIN_PANEL_WIDTH } from "~/lib/workspace/sizing";
import type { PanelId, PanelState } from "~/lib/workspace/types";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { readNavState, withPanelKeys } from "~/lib/workspace/commands";
import { selectionKey } from "~/lib/text/queries";
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
  const panelKeys = readNavState(location.state).panelKeys;
  const keysId = panelKeys?.join("|");
  const ws = useMemo(
    () => withPanelKeys(decodeWorkspace(urlToRef(decodeURIComponent(location.pathname.replace(/^\/+/, ""))), location.search as RawSearch), panelKeys),
    [location.pathname, location.search, keysId], // eslint-disable-line react-hooks/exhaustive-deps -- the keys' content, not the state object
  );
  const order = leaves(ws.layout);
  const panels = order.map((id) => ws.panels[id]!);
  const sizes = legacyRowSizes(panels);
  const layout = useMemo(() => {
    if (!ws.layout) return null;
    // One panel is still a row of one: the tree keeps its shape as panels open and close, so the panels that stay keep their
    // components (a bare leaf at the root would rebuild everything: CODE_REVIEW R-24)
    if (ws.layout.type === "leaf") return { type: "split", direction: "row", children: [ws.layout], sizes: [1] } as LayoutNode<PanelId>; // not row(): it normalises a row of one back to a leaf
    // A single row (everything the old reader could show) gets the old reader's widths; other shapes split evenly.
    const isRow = ws.layout.type === "split" && ws.layout.direction === "row" && ws.layout.children.every((c) => c.type === "leaf");
    return isRow ? withSizes(ws.layout, () => sizes.panels) : withSizes(ws.layout, (s) => s.children.map(() => 1));
  }, [ws.layout, sizes.panels]);

  if (!layout) return null;
  return (
    <WorkspaceNavProvider>
      <div className={styles.workspace}>
        <SplitView<PanelId>
          node={layout as LayoutNode<PanelId>}
          minLeafSize={MIN_PANEL_WIDTH}
          label={order.length > 1 ? "Open texts" : undefined}
          leafKey={(id) => ws.panels[id]?.key ?? id}
          renderLeaf={(id) => <PanelHost panel={ws.panels[id]!} data={data} innerSizes={sizes.inner[order.indexOf(id)]} alone={order.length === 1} />}
        />
      </div>
    </WorkspaceNavProvider>
  );
}

/** One panel: picks the component for its kind (more kinds — sheets, menus, search — plug in here). */
function PanelHost({ panel, data, innerSizes, alone }: { panel: PanelState; data: WorkspaceRouteData; innerSizes?: number[]; alone: boolean }) {
  const panelData = panelDataFor(panel, data);
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

/**
 * The loader's data for a panel. The address changes before the loader's data does, and data is filed by position: right after the
 * first of two panels closes, position p1 is the second text while the data's p1 is still the first. So a panel takes the data whose
 * ref it shows, wherever it was filed, and only otherwise the data at its position (CODE_REVIEW R-24: the panel that stayed kept its
 * component but rendered the closed panel's text until the load finished, then restarted its column).
 */
export function panelDataFor(panel: PanelState, data: WorkspaceRouteData) {
  // the same text in two panels (a translation opened beside its source) differs by the versions its URL asked for
  const shows = (d: WorkspaceRouteData["panels"][PanelId] | undefined) => !!d && d.ref === panel.ref && selectionKey(d.requested) === selectionKey(panel.versions);
  const atPosition = data.panels[panel.id];
  if (shows(atPosition)) return atPosition;
  return Object.values(data.panels).find(shows) ?? atPosition;
}
