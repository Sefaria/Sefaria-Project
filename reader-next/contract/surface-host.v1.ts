/**
 * SurfaceHost contract, major version 1: what a surface loaded into the reader at runtime (the social app) exports, and the host
 * object the reader hands it. The canonical source; a surface's repository keeps a pinned copy of this file and of
 * `surface-manifest.v1.schema.json` with the reader commit they came from.
 *
 * Self-contained on purpose (no imports), so it can be copied as is. The reader types it mirrors — the reader state API
 * (src/lib/reader-state/core/types.ts) and the workspace commands (src/lib/workspace/commands.ts) — are checked against it at
 * compile time (src/lib/surfaces/contract-conformance.ts): when they drift, the reader's typecheck fails.
 *
 * Compatibility: a minor version adds optional members only; anything else is a new major. The surface checks
 * `host.contract.major` on mount. Everything a surface receives from outside (snapshots, `ctx` values, location state) is untrusted
 * and must be validated at run time before use.
 *
 * How the reader loads a surface (src/lib/surfaces/load.ts): it fetches the manifest (surface-manifest.v1.ts) from an allowlisted
 * origin, validates it, refuses a contract major it does not serve, links every listed file with its integrity hash, then imports
 * the entry module and reads its default export, which must be a {@link Surface}.
 */

export const SURFACE_HOST_CONTRACT = { major: 1, minor: 2 } as const;

export type Unmount = () => void;
export type Unsubscribe = () => void;

// ── What the surface bundle exports (the default export of its entry module) ─────────────────────────────────────────────

export interface Surface {
  id: "social";
  /** The SurfaceHost major version the surface was built for. */
  contract: 1;
  /**
   * The full-page view under /social/*. The element is empty and sized; the reader removes it after unmount. Since 1.1 the reader may
   * move the same element, still mounted, into a column beside a text (see {@link SurfaceHost.openBeside}): the element then changes
   * size, so the surface lays out by its own width (container queries), not the window's.
   */
  mountPage(el: HTMLElement, host: SurfaceHost): Unmount;
  /** Survives navigation (mini view, room link, follow bar). Rendered beside the reader's <main> on every page while the lab is on. */
  mountPersistent(el: HTMLElement, host: SurfaceHost): Unmount;
}

// ── What the reader hands it ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SurfaceHost {
  contract: { major: 1; minor: number };
  location: {
    /**
     * The reader's full location. `state` is the surface's own history state for this entry (what it passed to `navigate`), not the
     * reader's: the reader keeps its own history-entry state apart, so neither can overwrite the other's keys.
     */
    get(): { pathname: string; search: string; hash: string; state: unknown };
    /** Fires after every change of the reader's location (push, replace, back/forward). */
    subscribe(cb: () => void): Unsubscribe;
  };
  /**
   * The only way to change the URL. `to` is a same-site path ("/social/r/abc", "/Genesis.1?lang=bi"); a page this reader renders is
   * a navigation in the app, a page Django serves is a full page load, anything else (another origin, a scheme) is refused and
   * reported.
   */
  navigate(to: string, opts?: { replace?: boolean; state?: unknown }): void;
  /** For <a href>: the address to write for a same-site path on this host (a Django page on the site's origin). "#" for a refused one. */
  href(to: string): string;
  /**
   * Since 1.1 (optional: an older reader lacks it, and the surface falls back to `navigate`). Opens a reader address ("/Genesis.1.3")
   * beside the surface's page: the page moves, still mounted, into a column at the inline start and the text comes in beside it (on a
   * phone the text covers the page). It is a history entry: Back, or the reader's close control, returns to the page as it was. While
   * the text is open the page mount's `location` keeps reporting the surface page that opened it (the reader's address is the text's,
   * with the reserved `ctx=social.beside`); the persistent mount's `location` is the reader's. Calling it again while a text is open
   * swaps the text (a new entry). `to` is checked like `navigate`'s; anything that is not a reader address is refused and reported.
   */
  openBeside?(to: string): void;
  reader: {
    /** The reader state API (docs/READER_STATE_API.md); the same object as window.sefariaReaderState. */
    state: ReaderStateApi;
    /** The reader's workspace commands (docs/WORKSPACE.md): read the open panels, send them somewhere, build links. */
    commands: WorkspaceCommands;
    /** The reserved `ctx` URL parameter: the context the reader is in, or null. */
    context: {
      get(): string | null;
      subscribe(cb: () => void): Unsubscribe;
    };
  };
  viewer: {
    get(): { id: number; name: string; imageUrl?: string } | null;
    subscribe(cb: () => void): Unsubscribe;
    /** A short-lived identity token from Django (POST /api/social/token), cached in memory until shortly before it expires. Rejects when signed out. */
    identityToken(): Promise<string>;
    /** Opens the reader's sign-in page, returning to the current address afterwards. */
    requestSignIn(): void;
  };
  /**
   * The interface language and colour theme, read at access time. The reader pins its theme to "light" today (dark mode is behind its
   * own flag, sepia was dropped at launch), so `theme` is "light" until that changes.
   */
  ui: {
    interfaceLang: "english" | "hebrew";
    theme: "light" | "dark" | "sepia";
    subscribe(cb: () => void): Unsubscribe;
    /**
     * Since 1.2 (optional: an older reader lacks it, and the surface keeps clear of a fixed header instead). The CSS pixels at each
     * edge of the viewport that the reader's own chrome occupies now — the site header and sticky panel headers at the top, an open
     * side panel at the inline end — so a surface's floating UI (a call window) can stay clear of them. `inlineStart`/`inlineEnd`
     * follow the interface's direction. `subscribe` fires when the values change (a panel opens or closes, the window resizes, the
     * header scrolls away). Read-only; the surface never learns the reader's markup.
     */
    chrome?: { get(): ChromeInsets; subscribe(cb: () => void): Unsubscribe };
  };
  config: { apiOrigin: string; relayOrigin: string; environment: "local" | "staging" | "production" };
  /** Errors go to the reader's browser error reporting, events to its analytics; both tagged with the surface's version. */
  report(event: { kind: "error" | "event"; name: string; data?: Record<string, unknown> }): void;
}

/** Since 1.2: see `SurfaceHost.ui.chrome`. */
export interface ChromeInsets {
  top: number;
  inlineStart: number;
  inlineEnd: number;
  bottom: number;
}

// ── The reader state API (mirrors src/lib/reader-state/core/types.ts) ──────────────────────────────────────────────────────

export type SliceId = string;
export interface SliceValue {
  v: number;
  value: unknown;
}
export interface ReaderSnapshot {
  v: 1;
  /** Same-site, relative: pathname + search in sefaria.org's grammar. Never carries `ctx`. */
  url: string;
  nav: unknown;
  slices: Record<SliceId, SliceValue>;
}
export interface SnapshotChange {
  url?: string;
  nav?: unknown;
  slices?: Record<SliceId, SliceValue | null>;
}
export interface SliceFilter {
  scope?: "moment" | "all";
  include?: SliceId[];
  exclude?: SliceId[];
}
export interface ApplyContext {
  origin: "playback" | "follow" | "external";
  persist: boolean;
  /** Set by the reader on the context it passes to each slice; callers leave it out. */
  signal?: AbortSignal;
}
/** Stable numeric codes: 100 ref unresolved, 101 version gone, 102 not permitted, 103 url refused, 200 slice unknown, 201 slice rejected, 202 slice failed, 300 anchor missing. */
export interface RestoreWarning {
  code: number;
  slice?: SliceId;
  detail?: string;
}
export interface ApplyResult {
  warnings: RestoreWarning[];
}
export interface ReaderStateApi {
  getSnapshot(filter?: SliceFilter): ReaderSnapshot;
  /** Restores what it can; never throws on a stale or foreign snapshot. Keeps the context (`ctx`) the reader is in. */
  applySnapshot(snapshot: ReaderSnapshot, ctx: ApplyContext): Promise<ApplyResult>;
  subscribe(onChange: (change: SnapshotChange, snapshot: ReaderSnapshot) => void, filter?: SliceFilter): Unsubscribe;
  onLocalInput(cb: () => void): Unsubscribe;
  readonly applying: boolean;
}

// ── The workspace commands (mirror src/lib/workspace/commands.ts and types.ts) ─────────────────────────────────────────────

export type LayoutNode<Id extends string = string> =
  | { type: "leaf"; id: Id }
  | { type: "split"; direction: "row" | "column"; children: LayoutNode<Id>[]; sizes?: number[] };
export type PanelId = `p${number}`;
export type AsideId = `${PanelId}a${number}`;
export interface AsideState {
  id: AsideId;
  kind: "connections";
  view: string;
  lang?: "en" | "he" | "bi";
  vside?: string;
  lookup?: string;
  sbsq?: string;
  entity?: { slug: string; text: string };
}
export interface TextPanelState {
  id: PanelId;
  key?: string;
  asides: AsideState[];
  asideLayout?: LayoutNode<AsideId>;
  kind: "text";
  ref: string;
  versions: { primary?: string; translation?: string };
  lang?: "bi" | "he" | "en";
  aliyot?: 0 | 1;
}
export type PanelState = TextPanelState;
export interface Workspace {
  panels: Record<PanelId, PanelState>;
  layout: LayoutNode<PanelId> | null;
  /** The reserved context; kept through every command. */
  ctx?: string;
}
export type NavKind = "scroll" | "stay" | "select" | "go";
export interface NavState {
  nav?: NavKind;
  panel?: PanelId;
  ref?: string;
  terms?: string[];
  panelKeys?: string[];
  canonical?: true;
}
export interface WorkspaceCommands {
  current: () => Workspace;
  go: (ws: Workspace, opts?: { replace?: boolean; state?: NavState }) => Promise<void>;
  href: (ws: Workspace) => string;
  canonicalize: () => Promise<boolean>;
}
