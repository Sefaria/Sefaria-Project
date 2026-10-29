/**
 * Workspace navigation without React (CODE_REVIEW §3.3, TARGET_ARCHITECTURE §6.1): read the workspace from the router's location, go
 * to a new one, link to one, and bring the address to its full form. The React provider (features/workspace/navigation.tsx) wraps
 * these; the integration layer (§6.12: commands from the Library Assistant and other apps) will call them directly.
 *
 * Every URL change goes through the router (rule 3): the full form sefaria.org writes is put in place by a replace navigation that
 * keeps the entry's own history state, never by history.replaceState behind the router's back.
 */
import { urlToRef } from "~/lib/ref/url";
import { isReaderPath } from "~/lib/reader/paths";
import { stringifySearch } from "~/lib/reader/search-serializer";
import type { ReaderSettings } from "~/lib/reader/settings";
import { leaves } from "~/lib/layout/tree";
import { EMPTY_WORKSPACE, type PanelId, type Workspace } from "./types";
import { decodeWorkspace, encodeWorkspace, DEFAULT_URL_DEFAULTS, type RawSearch, type UrlDefaults } from "./url";

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
  /** Each panel's stable key, in panel order (see PanelBase.key). */
  panelKeys?: string[];
  /** Set on the replace that only completed the address (canonicalize): the entry is still the one the reader arrived at. */
  canonical?: true;
}

let keySeq = 0;
const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/** The workspace's panels with their stable keys from history state; a panel without one is known by its position id. */
export function withPanelKeys(ws: Workspace, keys: readonly string[] | undefined): Workspace {
  const order = ws.layout ? leaves(ws.layout) : [];
  const usable = keys && keys.length === order.length ? keys : undefined;
  const panels = { ...ws.panels };
  order.forEach((id, i) => (panels[id] = { ...panels[id]!, key: usable?.[i] ?? panels[id]!.key ?? id }));
  return { ...ws, panels };
}

/**
 * The panels' stable keys for a history entry: the ones it records; or, for a navigation that recorded none (a plain link: a sidebar
 * view, a citation) and kept the number of panels, the keys the panels already had. Without the carry-over every such link rebuilt a
 * panel renumbered by an earlier close (review F07). Browser only: on the server there is no "already" to carry from.
 */
let carriedKeys: readonly string[] | undefined;
export function panelKeysFor(state: unknown, panelCount: number): readonly string[] | undefined {
  const own = readNavState(state).panelKeys;
  if (typeof window === "undefined") return own;
  if (own && own.length === panelCount) return (carriedKeys = own);
  return carriedKeys && carriedKeys.length === panelCount ? carriedKeys : undefined;
}

/** The keys to record for a workspace about to be navigated to: kept for panels that had one, new for panels just opened. */
export const panelKeysOf = (ws: Workspace): string[] => (ws.layout ? leaves(ws.layout) : []).map((id) => ws.panels[id]!.key ?? newKey());
export const readNavState = (state: unknown): NavState => (state && typeof state === "object" ? (state as NavState) : {});

/** How a panel should treat the current navigation. */
export function navFor(state: NavState, panel: PanelId): { kind: NavKind | undefined; ref?: string; mine: boolean } {
  if (!state.nav) return { kind: undefined, mine: true };
  const mine = state.panel === undefined || state.panel === panel;
  return { kind: mine ? state.nav : "scroll", ref: mine ? state.ref : undefined, mine };
}

/** What the URL writes for a panel that has not set its own language / aliyot: the reader's stored settings. */
export const urlDefaultsFor = (s: Pick<ReaderSettings, "language" | "aliyotTorah">): UrlDefaults => ({
  lang: s.language === "hebrew" ? "he" : s.language === "english" ? "en" : "bi",
  aliyot: s.aliyotTorah ? 1 : 0,
});

/** The history entry's key (TanStack Router stores it in the entry's state; replaced entries get a new one). */
export const entryKey = (state: unknown): string | undefined => (state as { __TSR_key?: string } | undefined)?.__TSR_key;

export function workspaceHref(ws: Workspace, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS): string {
  const enc = encodeWorkspace(ws, defaults);
  if (!enc) return "/";
  return `${enc.path}${stringifySearch(enc.search)}`;
}

/** The address in one spelling (a path may hold Hebrew: the browser reports it percent-encoded; `+` is a space in the query). */
const sameAddress = (a: string, b: string) => {
  const norm = (x: string) => {
    try {
      return decodeURIComponent(x).replace(/\+/g, " ");
    } catch {
      return x;
    }
  };
  return norm(a) === norm(b);
};

/** The slice of TanStack's router these commands use (so tests can pass a fake). */
export interface WorkspaceRouter {
  state: { location: { pathname: string; search: unknown; searchStr?: string; state?: unknown }; matches?: { routeId: string }[] };
  navigate: (opts: Record<string, unknown>) => Promise<void> | void;
}

export interface WorkspaceCommands {
  /** The workspace as of now (read from the router at call time, never stale). */
  current: () => Workspace;
  go: (ws: Workspace, opts?: { replace?: boolean; state?: NavState }) => Promise<void>;
  href: (ws: Workspace) => string;
  /**
   * Bring the address to the full form sefaria.org writes (its defaults filled in: `/Genesis.1` → `/Genesis.1?lang=bi&aliyot=0`), by a
   * replace navigation that keeps this entry's history state. Resolves to whether anything changed.
   */
  canonicalize: () => Promise<boolean>;
}

const READER_ROUTE = "/$";

export function createWorkspaceCommands(router: WorkspaceRouter, getDefaults: () => UrlDefaults): WorkspaceCommands {
  const splatOf = (pathname: string) => {
    try {
      return decodeURIComponent(pathname.replace(/^\/+/, ""));
    } catch {
      return pathname.replace(/^\/+/, "");
    }
  };
  const current = (): Workspace => {
    const loc = router.state.location;
    // off the reader (the home page, a library page) there is no workspace: "/" would decode as one panel with no ref, and a late
    // update to that panel (a reading position settling after the panel closed) brought it back with default settings
    if ((router.state.matches && !router.state.matches.some((m) => m.routeId === READER_ROUTE)) || !splatOf(loc.pathname) || !isReaderPath(loc.pathname)) return EMPTY_WORKSPACE;
    const ws = decodeWorkspace(urlToRef(splatOf(loc.pathname)), loc.search as RawSearch);
    return withPanelKeys(ws, panelKeysFor(loc.state, ws.layout ? leaves(ws.layout).length : 0));
  };
  const navigateTo = async (enc: { path: string; search: Record<string, string> }, opts: { replace?: boolean; state?: unknown }) => {
    await router.navigate({
      // the path as written (see RouterLink.toRouterLocation: a splat param would be encoded twice)
      to: enc.path,
      search: enc.search,
      replace: opts.replace,
      resetScroll: false,
      state: opts.state,
    });
  };
  return {
    current,
    async go(ws, opts = {}) {
      const enc = encodeWorkspace(ws, getDefaults());
      if (!enc) {
        // no panels left: the library, as the old client (it showed Browse the Library at /texts)
        await router.navigate({ to: "/texts", search: {} });
        return;
      }
      await navigateTo(enc, { ...opts, state: { ...opts.state, panelKeys: panelKeysOf(ws) } });
    },
    href: (ws) => workspaceHref(ws, getDefaults()),
    async canonicalize() {
      const loc = router.state.location;
      if (router.state.matches && !router.state.matches.some((m) => m.routeId === READER_ROUTE)) return false;
      // mid-navigation the matches can still be the reader's while the address is already a library page: "/texts" is not a book
      if (!isReaderPath(loc.pathname)) return false;
      const splat = splatOf(loc.pathname);
      if (!splat) return false;
      const enc = encodeWorkspace(decodeWorkspace(urlToRef(splat), loc.search as RawSearch), getDefaults());
      if (!enc) return false;
      const searchStr = loc.searchStr ?? stringifySearch(loc.search as Record<string, unknown>);
      if (sameAddress(`${enc.path}${stringifySearch(enc.search)}`, `${loc.pathname}${searchStr}`)) return false;
      // the same entry, the same reason for being here: only the address is completed
      const { __TSR_key: _key, __TSR_index: _index, key: _k, ...state } = (loc.state ?? {}) as Record<string, unknown>;
      await navigateTo(enc, { replace: true, state: { ...state, canonical: true } });
      return true;
    },
  };
}
