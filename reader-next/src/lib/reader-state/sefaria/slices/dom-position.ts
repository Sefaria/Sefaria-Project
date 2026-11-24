/**
 * Putting a panel's reader at a position from outside the reading-scroll engine (features/reader/use-reading-scroll.ts), for the
 * scroll slice. It measures the way the engine does — offsets from the top of the scrolling area, which is the column on desktop and
 * the window on a phone (decided by CSS) — and scrolls; the engine hears the scroll like any other and takes up the new place
 * (focus, anchor, and the URL's settle, a replace navigation).
 *
 * Why not the engine's own restorePosition: the engine lives inside TextColumn, which hands its owner only getPosition.
 */
import { focusRule, TARGET_OFFSET_PAST_THRESHOLD } from "~/lib/reader/column";

const segmentSelector = (ref: string) => `[role="group"][data-ref="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(ref) : ref.replace(/["\\]/g, "\\$&")}"]`;

function scrollerOf(root: HTMLElement): HTMLElement | Window {
  const el = root.querySelector<HTMLElement>("[data-reader-scroller]");
  if (!el) return window;
  const o = getComputedStyle(el).overflowY;
  return o === "auto" || o === "scroll" ? el : window;
}

/** Scroll so the segment `ref` inside `root` sits `offset` px below the top of the scrolling area. False when it is not loaded. */
export function placeSegment(root: HTMLElement, pos: { ref: string; offset: number }): boolean {
  const seg = root.querySelector(segmentSelector(pos.ref));
  if (!seg) return false;
  const s = scrollerOf(root);
  const top = s === window ? 0 : (s as HTMLElement).getBoundingClientRect().top;
  const delta = seg.getBoundingClientRect().top - top - pos.offset;
  if (Math.abs(delta) >= 0.5) {
    if (s === window) window.scrollTo(0, window.scrollY + delta);
    else (s as HTMLElement).scrollTop += delta;
  }
  return true;
}

/** Bring a segment to the reading line, as the engine's scrollToSegment does. */
export function scrollSegmentToLine(root: HTMLElement, ref: string, opts: { connectionsOnScreen?: boolean } = {}): boolean {
  const line = focusRule(window.innerHeight, { mobile: scrollerOf(root) === window, connectionsOnScreen: opts.connectionsOnScreen }).threshold + TARGET_OFFSET_PAST_THRESHOLD;
  return placeSegment(root, { ref, offset: line });
}
