/**
 * Turning workspace operations into navigations. The URL is the workspace (lib/workspace/url.ts): an operation
 * produces a new workspace, which is encoded and navigated to. History state records why the URL changed and
 * which panel caused it, so only that panel reacts (docs/WORKSPACE.md, "The URL is still the state").
 */
import { useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { PositionStore, type EntryPositions, type SavedPosition } from "~/lib/reader/position-store";
import { urlToRef } from "~/lib/ref/url";
import { stringifySearch } from "~/lib/reader/search-serializer";
import { decodeWorkspace, encodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import type { PanelId, Workspace } from "~/lib/workspace/types";

/**
 * Why the URL changed:
 *  - "scroll": the address bar caught up with a panel's reading position — nothing on screen should move;
 *  - "stay": something changed that does not move the text (a sidebar view, a display setting);
 *  - "select": the reader chose a verse in a panel — it becomes current, nothing scrolls;
 *  - "go": a panel was sent somewhere (a link inside it, a connection opened) — that panel goes there;
 *  - none: a real navigation (typed URL, outside link, back/forward) — every panel goes to its URL.
 */
export type NavKind = "scroll" | "stay" | "select" | "go";
export interface NavState {
  nav?: NavKind;
  panel?: PanelId;
  /** The verse a "select" chose (the location changes before the loader's data does). */
  ref?: string;
  /** The words a search matched, to highlight in the verse a "go" opened (SRC-058; never in the URL — the old `qh` was dead). */
  terms?: string[];
}
export const readNavState = (state: unknown): NavState => (state && typeof state === "object" ? (state as NavState) : {});

/** How a panel should treat the current navigation. */
export function navFor(state: NavState, panel: PanelId): { kind: NavKind | undefined; ref?: string; mine: boolean } {
  if (!state.nav) return { kind: undefined, mine: true };
  const mine = state.panel === undefined || state.panel === panel;
  return { kind: mine ? state.nav : "scroll", ref: mine ? state.ref : undefined, mine };
}

export function workspaceHref(ws: Workspace): string {
  const enc = encodeWorkspace(ws);
  if (!enc) return "/";
  return `${enc.path}${stringifySearch(enc.search)}`;
}

/** The history entry's key (TanStack Router stores it in the entry's state; replaced entries get a new one). */
export const entryKey = (state: unknown): string | undefined => (state as { __TSR_key?: string } | undefined)?.__TSR_key;

interface WorkspaceNav {
  /** A panel offers a way to read where its reader is, so it can be saved at every history change. */
  registerPanel: (id: PanelId, getPosition: () => SavedPosition | undefined) => () => void;
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
  const store = useRef<PositionStore | null>(null);
  store.current ??= new PositionStore(safeSessionStorage());
  const readers = useRef(new Map<PanelId, () => SavedPosition | undefined>());
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
      poppedKey.current = action.type === "BACK" || action.type === "FORWARD" || action.type === "GO" ? next : undefined;
      lastKey = next;
    });
  }, [router]);

  const registerPanel = useCallback<WorkspaceNav["registerPanel"]>((id, read) => {
    readers.current.set(id, read);
    return () => {
      if (readers.current.get(id) === read) readers.current.delete(id);
    };
  }, []);
  const restoreFor = useCallback<WorkspaceNav["restoreFor"]>((key, id) => (key && poppedKey.current === key ? store.current!.get(key)?.[id] : undefined), []);
  const current = useCallback(() => {
    const loc = router.state.location;
    const splat = decodeURIComponent(loc.pathname.replace(/^\/+/, ""));
    return decodeWorkspace(urlToRef(splat), loc.search as RawSearch);
  }, [router]);
  const go = useCallback<WorkspaceNav["go"]>(
    (ws, opts = {}) => {
      const enc = encodeWorkspace(ws);
      if (!enc) {
        void router.navigate({ to: "/" });
        return;
      }
      void router.navigate({
        to: "/$",
        params: { _splat: enc.path.slice(1) },
        search: enc.search as never,
        replace: opts.replace,
        resetScroll: false,
        state: opts.state as never,
      });
    },
    [router],
  );
  const value = useMemo(() => ({ current, href: workspaceHref, go, registerPanel, restoreFor }), [current, go, registerPanel, restoreFor]);
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
