import { useLocation } from "@tanstack/react-router";
import { Suspense, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { useRegisterSlice } from "~/features/reader-state/context";
import { createFocusSlice, type FocusValue } from "~/lib/reader-state/sefaria/slices/focus";
import { leaves, withSizes, type LayoutNode } from "~/lib/layout/tree";
import { urlToRef } from "~/lib/ref/url";
import { legacyRowSizes, MIN_PANEL_WIDTH } from "~/lib/workspace/sizing";
import type { PanelId, PanelState } from "~/lib/workspace/types";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { panelKeysFor, readNavState, withPanelKeys } from "~/lib/workspace/commands";
import { selectionKey } from "~/lib/text/queries";
import { ErrorState, LoadingState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { ReportingBoundary } from "~/lib/monitoring/ErrorBoundary";
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
  const ownKeys = readNavState(location.state).panelKeys?.join("|");
  const ws = useMemo(() => {
    const decoded = decodeWorkspace(urlToRef(decodeURIComponent(location.pathname.replace(/^\/+/, ""))), location.search as RawSearch);
    // the entry's keys, or the panels' own when a plain link recorded none (commands.panelKeysFor)
    return withPanelKeys(decoded, panelKeysFor(location.state, decoded.layout ? leaves(decoded.layout).length : 0));
  }, [location.pathname, location.search, ownKeys]); // eslint-disable-line react-hooks/exhaustive-deps -- the keys' content, not the state object
  const order = leaves(ws.layout);
  const panels = order.map((id) => ws.panels[id]!);
  const sizes = legacyRowSizes(panels);
  const layout = useMemo(() => {
    if (!ws.layout) return null;
    // One panel is still a row of one: the tree keeps its shape as panels open and close, so the panels that stay keep their
    // components (a bare leaf at the root would rebuild everything)
    if (ws.layout.type === "leaf") return { type: "split", direction: "row", children: [ws.layout], sizes: [1] } as LayoutNode<PanelId>; // not row(): it normalises a row of one back to a leaf
    // A single row (everything the old reader could show) gets the old reader's widths; other shapes split evenly.
    const isRow = ws.layout.type === "split" && ws.layout.direction === "row" && ws.layout.children.every((c) => c.type === "leaf");
    return isRow ? withSizes(ws.layout, () => sizes.panels) : withSizes(ws.layout, (s) => s.children.map(() => 1));
  }, [ws.layout, sizes.panels]);

  const focus = usePanelFocus(ws.panels);
  // A phone shows one panel, the first — unless a replay or a followed leader put the focus on another (sefaria.focus): then that one.
  const phonePanel = focus.applied ? order.find((pid) => (ws.panels[pid]?.key ?? pid) === focus.applied) : undefined;
  const phoneShows = phonePanel && phonePanel !== order[0] && /^[\w-]+$/.test(phonePanel) ? phonePanel : undefined;

  if (!layout) return null;
  return (
    <WorkspaceNavProvider>
      {phoneShows && (
        // same breakpoint as Workspace.module.css's phone rules; only rendered after an apply, so never part of the server render
        <style>{`@media (max-width: 842px){[data-phone-panel="${phoneShows}"]>[data-direction]>div:first-child{display:none}[data-phone-panel="${phoneShows}"]>[data-direction]>div:has([data-leaf="${phoneShows}"]){display:block}}`}</style>
      )}
      <div className={styles.workspace} data-phone-panel={phoneShows} onPointerDownCapture={focus.onInteract} onFocusCapture={focus.onInteract}>
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

/**
 * `sefaria.focus`: the panel last interacted with (pointer down or keyboard focus inside it), by its stable key. `applied` is the key a
 * replay or a followed leader set, until the person interacts with another panel themself.
 */
function usePanelFocus(panels: Record<PanelId, PanelState>) {
  const [focus, setFocus] = useState<{ key: string | null; applied: string | null }>({ key: null, applied: null });
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const listeners = useRef(new Set<() => void>());
  const lastKey = useRef(focus.key);
  useEffect(() => {
    if (lastKey.current === focus.key) return;
    lastKey.current = focus.key;
    for (const cb of [...listeners.current]) cb();
  }, [focus.key]);
  const slice = useMemo(
    () =>
      createFocusSlice({
        get: (): FocusValue => (focusRef.current.key ? { panelKey: focusRef.current.key } : null),
        apply: (value) => setFocus({ key: value?.panelKey ?? null, applied: value?.panelKey ?? null }),
        subscribe: (cb) => {
          listeners.current.add(cb);
          return () => void listeners.current.delete(cb);
        },
      }),
    [],
  );
  useRegisterSlice(slice);
  const onInteract = (e: SyntheticEvent) => {
    const id = (e.target as Element | null)?.closest?.("[data-panel-id]")?.getAttribute("data-panel-id") as PanelId | null | undefined;
    const panel = id ? panelsRef.current[id] : undefined;
    if (!panel) return;
    const key = panel.key ?? panel.id;
    setFocus((f) => (f.key === key ? f : { key, applied: f.applied === key ? f.applied : null }));
  };
  return { applied: focus.applied, onInteract };
}

/** One panel: picks the component for its kind (more kinds — sheets, menus, search — plug in here). */
function PanelHost({ panel, data, innerSizes, alone }: { panel: PanelState; data: WorkspaceRouteData; innerSizes?: number[]; alone: boolean }) {
  const panelData = panelDataFor(panel, data);
  // A panel just opened while its text loads.
  if (!panelData) return <LoadingState />;
  switch (panel.kind) {
    case "text":
      return (
        // a panel that fails to render is reported and shows the error message in its place; the other panels keep working
        <ReportingBoundary name="panel" resetKey={panel.ref} fallback={() => <ErrorState title={<InterfaceText en="Something went wrong!" he="ארעה תקלה במערכת." />}><InterfaceText en="Please use the back button or the menus above to get back on track." he="אנא חזרו לתפריט הראשי או אחורנית על ידי שימוש בכפתורי התפריט או החזור." /></ErrorState>}>
          <Suspense fallback={<LoadingState />}>
            <TextPanel panel={panel} data={panelData} innerSizes={innerSizes} alone={alone} />
          </Suspense>
        </ReportingBoundary>
      );
  }
}

/**
 * The loader's data for a panel. The address changes before the loader's data does, and data is filed by position: right after the
 * first of two panels closes, position p1 is the second text while the data's p1 is still the first. So a panel takes the data whose
 * ref it shows, wherever it was filed, and only otherwise the data at its position (the panel that stayed kept its
 * component but rendered the closed panel's text until the load finished, then restarted its column).
 */
export function panelDataFor(panel: PanelState, data: WorkspaceRouteData) {
  // the same text in two panels (a translation opened beside its source) differs by the versions its URL asked for
  const shows = (d: WorkspaceRouteData["panels"][PanelId] | undefined) => !!d && d.ref === panel.ref && selectionKey(d.requested) === selectionKey(panel.versions);
  const atPosition = data.panels[panel.id];
  if (shows(atPosition)) return atPosition;
  return Object.values(data.panels).find(shows) ?? atPosition;
}
