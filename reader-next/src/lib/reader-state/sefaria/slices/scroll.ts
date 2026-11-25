/**
 * `sefaria.scroll` (moment): where each panel's reader is, as an anchor — the segment at the reading line and its distance from the
 * top of the scrolling area — keyed by the panel's stable key (PanelState.key), never its position id, which changes as panels close.
 *
 * The workspace's navigation provider (features/workspace/navigation.tsx) keeps the panels' readers and turns them into a
 * {@link ScrollPanels}; this file only knows that interface, so it is testable without a DOM.
 */
import { frameOrTimeout } from "~/lib/reader-state/core/api";
import type { StateSlice } from "~/lib/reader-state/core/types";

export const SCROLL_SLICE_ID = "sefaria.scroll";
export const SCROLL_SLICE_VERSION = 1;
/** After the URL's data is on screen (the API applies lower orders first). */
export const SCROLL_APPLY_ORDER = 100;
/** How long apply keeps trying a panel whose text is still loading. */
export const SCROLL_APPLY_TIMEOUT_MS = 3000;

export interface PanelAnchor {
  ref: string;
  offset: number;
}
export type ScrollValue = Record<string, PanelAnchor>;

/** One panel's reader, as the scroll slice sees it. */
export interface ScrollPanel {
  key: string;
  getPosition(): PanelAnchor | undefined;
  /** Put the reader at the position. False when that segment is not loaded (yet). */
  restorePosition(pos: PanelAnchor): boolean;
  /** Bring a segment to the reading line; false when it is not loaded. The fallback once restorePosition has kept failing. */
  scrollToSegment(ref: string): boolean;
}

export interface ScrollPanels {
  /** The panels mounted now. */
  list(): ScrollPanel[];
  /** Fires when a panel's reader moved (at most once per frame is the caller's business; the API coalesces anyway). */
  onMove(cb: () => void): () => void;
}

export interface ScrollSliceOptions {
  /** Schedules the next attempt; default requestAnimationFrame (setTimeout 16 ms where there are no frames). */
  frame?: (cb: () => void) => void;
  now?: () => number;
  timeoutMs?: number;
}

const MAX_KEY = 200;
const MAX_REF = 500;

export function isScrollValue(x: unknown): x is ScrollValue {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!k || k.length > MAX_KEY) return false;
    if (!v || typeof v !== "object") return false;
    const { ref, offset } = v as { ref?: unknown; offset?: unknown };
    if (typeof ref !== "string" || !ref || ref.length > MAX_REF) return false;
    if (typeof offset !== "number" || !Number.isFinite(offset)) return false;
  }
  return true;
}

// a frame, or 100 ms where none come (a background tab): retries must not stall there
const defaultFrame = (cb: () => void) => (typeof requestAnimationFrame === "function" ? frameOrTimeout(cb) : void setTimeout(cb, 16));
const defaultNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createScrollSlice(panels: ScrollPanels, opts: ScrollSliceOptions = {}): StateSlice<ScrollValue> {
  const frame = opts.frame ?? defaultFrame;
  const now = opts.now ?? defaultNow;
  const timeoutMs = opts.timeoutMs ?? SCROLL_APPLY_TIMEOUT_MS;
  /** Bumped by every apply: a newer apply ends the retries of an older one (a follower's next scroll arrives before the text did). */
  let generation = 0;

  return {
    id: SCROLL_SLICE_ID,
    version: SCROLL_SLICE_VERSION,
    scope: "moment",
    applyOrder: SCROLL_APPLY_ORDER,
    get() {
      const out: ScrollValue = {};
      for (const p of panels.list()) {
        const pos = p.getPosition();
        if (pos) out[p.key] = { ref: pos.ref, offset: pos.offset };
      }
      return out;
    },
    /**
     * Each panel named in the value is put back with restorePosition, retried every frame until it lands or the time is up (the panel
     * may not be mounted yet, or its text not loaded); then scrollToSegment as a last try. Panels not in the value are left alone.
     * Stops at once when the API aborts the apply (ctx.signal): after the person's input or a newer apply, landing late would move a
     * reader that is no longer the apply's.
     */
    apply(value, ctx) {
      const signal = ctx?.signal;
      const gen = ++generation;
      const pending = new Map(Object.entries(value).map(([k, v]) => [k, { ref: v.ref, offset: v.offset }] as const));
      const deadline = now() + timeoutMs;
      return new Promise<void>((resolve) => {
        const attempt = () => {
          if (gen !== generation || signal?.aborted) return resolve();
          const mounted = new Map(panels.list().map((p) => [p.key, p] as const));
          for (const [key, pos] of pending) {
            const p = mounted.get(key);
            if (p?.restorePosition(pos)) pending.delete(key);
          }
          if (!pending.size) return resolve();
          if (now() >= deadline) {
            for (const [key, pos] of pending) mounted.get(key)?.scrollToSegment(pos.ref);
            return resolve();
          }
          frame(attempt);
        };
        attempt();
      });
    },
    subscribe: (cb) => panels.onMove(cb),
    validate: isScrollValue,
  };
}
