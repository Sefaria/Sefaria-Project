/**
 * The reader state API's contract (docs/READER_STATE_API.md): snapshots of everything on screen, the changes between them, the slices that
 * hold what the URL does not, streams of keyframes and changes, and the transports that carry them.
 *
 * This folder (src/lib/reader-state/core) is the future open-source package: no React, no router, no DOM types beyond the standard
 * library's, and no imports from "~/". A host (src/lib/reader-state/sefaria) binds it to a real reader.
 */

// ── Snapshots ────────────────────────────────────────────────────────────────────────────────────────────────

/** Namespaced: "sefaria.settings", "sefaria.scroll"; other readers use their own prefix. */
export type SliceId = string;

export interface SliceValue {
  /** The slice's version when the value was taken. */
  v: number;
  value: unknown;
}

export interface ReaderSnapshot {
  v: 1;
  /** Host-defined location. For this reader: pathname + search, in sefaria.org's grammar, same-site and relative ("/Genesis.1?lang=bi"). */
  url: string;
  /** Host-defined history-entry state (for this reader: NavState, minus anything entry-specific such as the history key). */
  nav: unknown;
  slices: Record<SliceId, SliceValue>;
}

/** What changed between two snapshots. An absent field did not change; a slice set to null was removed. */
export interface SnapshotChange {
  url?: string;
  nav?: unknown;
  slices?: Record<SliceId, SliceValue | null>;
}

// ── Slices ───────────────────────────────────────────────────────────────────────────────────────────────────

export type SliceScope = "personal" | "moment";

export interface ApplyContext {
  /** Who is applying. Never the person themself: their own changes are not applied, they happen. */
  origin: "playback" | "follow" | "external";
  /** Persist the value (cookies, preferences, reading history)? False for every origin today. */
  persist: boolean;
  /**
   * Set by the API on the context it passes to `slice.apply` (callers leave it out): aborted when the apply is over for the slice's
   * purposes — the person's input took the reader back, or a newer applySnapshot superseded this one. A slice that keeps working after
   * apply was called (scroll retrying while its text loads) stops when it fires.
   */
  signal?: AbortSignal;
}

export interface StateSlice<T = unknown> {
  id: SliceId;
  /** Bumped when T changes shape. */
  version: number;
  /** "personal": the reader's own preference (not sent to followers by default). "moment": what is on screen now. */
  scope: SliceScope;
  get(): T;
  /** May be async (scroll waits for its text); the API awaits it. */
  apply(value: T, ctx: ApplyContext): void | Promise<void>;
  subscribe(onChange: () => void): () => void;
  /** Turn an older version's value into the current shape; undefined declines it (restored with warning 201). */
  migrate?(value: unknown, fromVersion: number): T | undefined;
  /** Validate a value from outside before apply (runtime check; types are erased). False → warning 201. Default: accept. */
  validate?(value: unknown): value is T;
  /** Order of application: lower first. Default 0. Scroll uses 100 (it needs the text on screen). */
  applyOrder?: number;
}

export interface SliceRegistry {
  register(slice: StateSlice<any>): () => void; // eslint-disable-line @typescript-eslint/no-explicit-any -- the registry holds slices of every state type
  get(id: SliceId): StateSlice | undefined;
  list(): StateSlice[];
  /** Fires when a slice is registered or unregistered. */
  onChange(cb: () => void): () => void;
}

export interface SliceFilter {
  /** "moment": only moment slices. "all" (default): every slice. */
  scope?: "moment" | "all";
  include?: SliceId[];
  exclude?: SliceId[];
}

// ── Warnings ─────────────────────────────────────────────────────────────────────────────────────────────────

export const WARNING = {
  /** A ref no longer resolves. */
  REF_UNRESOLVED: 100,
  /** A version is gone; the default version is shown. */
  VERSION_GONE: 101,
  /** The location is not visible to this person. */
  NOT_PERMITTED: 102,
  /** The url was refused (not a same-site path the host serves). */
  URL_REFUSED: 103,
  /** A slice in the snapshot is not registered here. */
  SLICE_UNKNOWN: 200,
  /** A slice value is from a newer version, failed validation, or migrate declined it. */
  SLICE_REJECTED: 201,
  /** A slice's apply threw. */
  SLICE_FAILED: 202,
  /** The scroll anchor's segment is not in the loaded section. */
  ANCHOR_MISSING: 300,
} as const;
export type WarningCode = (typeof WARNING)[keyof typeof WARNING];

export interface RestoreWarning {
  code: WarningCode;
  slice?: SliceId;
  detail?: string;
}

export interface ApplyResult {
  warnings: RestoreWarning[];
}

// ── The API ──────────────────────────────────────────────────────────────────────────────────────────────────

export type ChangeCause = "local" | "applied";

export interface ReaderStateApi {
  getSnapshot(filter?: SliceFilter): ReaderSnapshot;
  /** Restore what it can; never throws on a stale or foreign snapshot (the input is validated first). */
  applySnapshot(snapshot: ReaderSnapshot, ctx: ApplyContext): Promise<ApplyResult>;
  /**
   * Every settled change the person made — never one applySnapshot made. Coalesced: at most one call per animation frame (or microtask
   * where there are no frames). `snapshot` is the state after the change, filtered.
   */
  subscribe(onChange: (change: SnapshotChange, snapshot: ReaderSnapshot) => void, filter?: SliceFilter): () => void;
  /** Input from the person (pointer, wheel, key, touch) that may not have changed state yet: lets a follower break away at once. */
  onLocalInput(cb: () => void): () => void;
  /** True while an applySnapshot is in progress. */
  readonly applying: boolean;
}

/** What a reader implements to use the core. */
export interface ReaderHost {
  getLocation(): { url: string; nav: unknown };
  /** Go to a location. Resolves once the navigation is committed. */
  navigate(url: string, nav: unknown, mode: "push" | "replace"): Promise<void>;
  /** Resolves once the current location's data is on screen (slices such as scroll apply after). */
  settled(): Promise<void>;
  /** Fires after every committed location change. The host cannot tell applied from local; the API does (its apply window). */
  onLocationChange(cb: () => void): () => void;
  /** The person's own input events (pointerdown, wheel, keydown, touchstart) and back/forward. */
  onLocalInput(cb: (kind: "input" | "history") => void): () => void;
  /** Is this url one the host will navigate to? (same-site, relative, a page of this client) */
  acceptsUrl(url: string): boolean;
  slices: SliceRegistry;
  /** Schedules coalesced work; defaults to requestAnimationFrame or a microtask. */
  schedule?(cb: () => void): void;
}

// ── Streams ──────────────────────────────────────────────────────────────────────────────────────────────────

/** `seq` increases by one per message of one stream; `t` is ms since the stream started. */
export type StreamMessage =
  | { type: "keyframe"; seq: number; t: number; snapshot: ReaderSnapshot }
  | { type: "change"; seq: number; t: number; change: SnapshotChange };

export interface StreamWriterOptions {
  filter?: SliceFilter;
  /** Keyframe after this many ms since the last (default 10_000). */
  keyframeEveryMs?: number;
  /** ...or this many changes (default 50). */
  keyframeEveryChanges?: number;
  /** Minimum ms between two changes of the same slice (scroll sampling): { "sefaria.scroll": 250 }. The last value is never dropped. */
  sampleMs?: Record<SliceId, number>;
  /** Injected clock (ms); default performance.now / Date.now. */
  now?: () => number;
}

export interface StreamWriter {
  /** Starts with a keyframe. */
  start(emit: (msg: StreamMessage) => void): void;
  /** Emit a keyframe now (a follower asked to resync). */
  keyframe(): void;
  stop(): void;
}

export interface StreamReader {
  /** Feed a message. Returns the warnings of the apply it caused, if it applied. */
  push(msg: StreamMessage): Promise<ApplyResult | undefined>;
  /** The state the stream describes now (folded), whether or not it was applied. Undefined before the first keyframe. */
  current(): ReaderSnapshot | undefined;
  /** Stop applying, keep folding (a follower broke away). */
  pause(): void;
  /** Apply current() at once and continue applying. */
  resume(): Promise<ApplyResult | undefined>;
  readonly paused: boolean;
  /** Called on a seq gap: the reader needs a keyframe. */
  onGap(cb: () => void): () => void;
}

// ── Recordings ───────────────────────────────────────────────────────────────────────────────────────────────

export interface Recording {
  v: 1;
  /** ISO time the recording started. */
  startedAt: string;
  /** ms */
  duration: number;
  /** Optional: the client that made it ("sefaria-reader@<version>"). */
  client?: string;
  messages: StreamMessage[];
}

// ── Transports ───────────────────────────────────────────────────────────────────────────────────────────────

export type TransportStatus = "connecting" | "open" | "closed";

export interface StateTransport<M = unknown> {
  send(msg: M): void;
  onMessage(cb: (msg: M) => void): () => void;
  onStatus(cb: (status: TransportStatus) => void): () => void;
  readonly status: TransportStatus;
  close(): void;
}
