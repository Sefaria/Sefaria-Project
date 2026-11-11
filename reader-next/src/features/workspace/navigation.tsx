/**
 * Turning workspace operations into navigations. The URL is the workspace (lib/workspace/url.ts): an operation
 * produces a new workspace, which is encoded and navigated to. History state records why the URL changed and
 * which panel caused it, so only that panel reacts (docs/WORKSPACE.md, "The URL is still the state").
 */
import { useLocation, useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { PositionStore, type EntryPositions, type SavedPosition } from "~/lib/reader/position-store";
import { createWorkspaceCommands, entryKey, readNavState, urlDefaultsFor, type NavState, type WorkspaceRouter } from "~/lib/workspace/commands";
import { useReaderSettings } from "../reader/settings-context";
import { useRegisterSlice } from "~/features/reader-state/context";
import { createScrollSlice, type ScrollPanel } from "~/lib/reader-state/sefaria/slices/scroll";
import type { PanelId, Workspace } from "~/lib/workspace/types";

// The navigation vocabulary lives in src/lib/workspace/commands.ts (usable outside React); re-exported for the reader's features.
export { entryKey, navFor, panelKeysOf, readNavState, urlDefaultsFor, workspaceHref, type NavKind, type NavState } from "~/lib/workspace/commands";

/**
 * What a panel offers beyond reading its place, for the reader state API's `sefaria.scroll` slice: its stable key (PanelState.key, not
 * the position id), a way to put its reader at a position, and a way to hear that it moved.
 */
export interface PanelPlacement {
  key: string;
  /** Put the reader at the position; false when that segment is not loaded (yet). */
  restorePosition: (pos: SavedPosition) => boolean;
  /** Bring a segment to the reading line; false when it is not loaded. */
  scrollToSegment: (ref: string) => boolean;
}

interface WorkspaceNav {
  /**
   * A panel offers a way to read where its reader is, so it can be saved at every history change — and, optionally, a way to put
   * its reader somewhere (the scroll slice).
   */
  registerPanel: (id: PanelId, getPosition: () => SavedPosition | undefined, placement?: PanelPlacement) => () => void;
  /** A panel's reader moved (scrolling): the scroll slice tells its subscribers, at most once per frame. */
  panelMoved: () => void;
  /** Where to put a panel's reader if the current entry was reached by back/forward (else undefined). */
  restoreFor: (key: string | undefined, id: PanelId) => SavedPosition | undefined;
  /** The workspace as of now (read from the router at call time, never stale). */
  current: () => Workspace;
  href: (ws: Workspace) => string;
  go: (ws: Workspace, opts?: { replace?: boolean; state?: NavState }) => void;
}

const Ctx = createContext<WorkspaceNav | null>(null);

export function WorkspaceNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const location = useLocation();
  const { settings } = useReaderSettings();
  const defaults = useMemo(() => urlDefaultsFor(settings), [settings.language, settings.aliyotTorah]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const commands = useMemo(() => createWorkspaceCommands(router as unknown as WorkspaceRouter, () => defaultsRef.current), [router]);
  const store = useRef<PositionStore | null>(null);
  store.current ??= new PositionStore(safeSessionStorage());
  const readers = useRef(new Map<PanelId, () => SavedPosition | undefined>());
  const placements = useRef(new Map<PanelId, { read: () => SavedPosition | undefined; placement: PanelPlacement }>());
  const moveListeners = useRef(new Set<() => void>());
  const moveFrame = useRef(0);
  const poppedKey = useRef<string | undefined>(undefined);

  // Save every panel's place at each history change — while the page still shows what is being left — and
  // remember which entry arrived by back/forward (its panels restore their saved place). A replaced entry
  // gets a new key from the history layer, so its places are copied to it. SHL-064, SHL-065
  useEffect(() => {
    let lastKey = entryKey(router.history.location.state);
    return router.history.subscribe(({ location, action }) => {
      const next = entryKey(location.state);
      const positions: EntryPositions = {};
      for (const [id, read] of readers.current) {
        const pos = read();
        if (pos) positions[id] = pos;
      }
      store.current!.set(lastKey, positions);
      if (action.type === "REPLACE") store.current!.set(next, positions);
      // a replace of the entry just reached by back/forward (the address completed) is still that arrival:
      // its panels must restore their saved place, so the popped key follows the entry to its new key
      if (action.type === "BACK" || action.type === "FORWARD" || action.type === "GO") poppedKey.current = next;
      // (only that replace: a scroll pause also replaces the entry, and must not count as arriving again, or every pause re-restores)
      else if (action.type === "REPLACE" && poppedKey.current !== undefined && poppedKey.current === lastKey && readNavState(location.state).canonical) {
        store.current!.set(next, store.current!.get(lastKey) ?? positions);
        poppedKey.current = next;
      } else poppedKey.current = undefined;
      lastKey = next;
    });
  }, [router]);

  const registerPanel = useCallback<WorkspaceNav["registerPanel"]>((id, read, placement) => {
    readers.current.set(id, read);
    const entry = placement ? { read, placement } : undefined;
    if (entry) placements.current.set(id, entry);
    return () => {
      if (readers.current.get(id) === read) readers.current.delete(id);
      if (entry && placements.current.get(id) === entry) placements.current.delete(id);
    };
  }, []);

  // The `sefaria.scroll` slice: every panel's anchor by its stable key. Movement is told at most once per frame.
  const panelMoved = useCallback(() => {
    if (moveFrame.current || !moveListeners.current.size) return;
    const fire = () => {
      moveFrame.current = 0;
      for (const cb of [...moveListeners.current]) cb();
    };
    moveFrame.current = typeof requestAnimationFrame === "function" ? requestAnimationFrame(fire) : (setTimeout(fire, 16) as unknown as number);
  }, []);
  useEffect(
    () => () => {
      if (moveFrame.current && typeof cancelAnimationFrame === "function") cancelAnimationFrame(moveFrame.current);
      moveFrame.current = 0;
    },
    [],
  );
  const scrollSlice = useMemo(
    () =>
      createScrollSlice({
        list: () =>
          [...placements.current.values()].map(
            ({ read, placement }): ScrollPanel => ({
              key: placement.key,
              getPosition: read,
              restorePosition: placement.restorePosition,
              scrollToSegment: placement.scrollToSegment,
            }),
          ),
        onMove: (cb) => {
          moveListeners.current.add(cb);
          return () => void moveListeners.current.delete(cb);
        },
      }),
    [],
  );
  useRegisterSlice(scrollSlice);
  const restoreFor = useCallback<WorkspaceNav["restoreFor"]>((key, id) => (key && poppedKey.current === key ? store.current!.get(key)?.[id] : undefined), []);
  const go = useCallback<WorkspaceNav["go"]>((ws, opts) => void commands.go(ws, opts), [commands]);
  const href = useCallback((ws: Workspace) => commands.href(ws), [commands, defaults]); // eslint-disable-line react-hooks/exhaustive-deps

  // The address bar shows the full form sefaria.org writes (its defaults filled in), on arrival and when a setting it carries changes:
  // a replace navigation through the router, keeping the entry's state (never history.replaceState).
  useEffect(() => {
    void commands.canonicalize();
  }, [commands, location.href, defaults]);

  const value = useMemo(() => ({ current: commands.current, href, go, registerPanel, panelMoved, restoreFor }), [commands, href, go, registerPanel, panelMoved, restoreFor]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceNav(): WorkspaceNav {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspaceNav outside WorkspaceNavProvider");
  return v;
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // blocked storage
  }
}
