/**
 * Pure logic behind the scrolling text column.
 *
 * @feature TXD-052 Infinite scroll up and down in the reader
 * @feature TXD-055 Visible-ref tracking drives URL and header
 */

/** Distance (px) from a column edge at which the next/previous section starts loading. Generous, so a
 * section is usually in place (from the cache) well before the reader reaches the edge. */
export const LOAD_MARGIN = 1800;

/** Height (px) of the placeholder at each end of the column. Constant whether it shows a spinner or not,
 * so loading never shifts the text. */
export const EDGE_PLACEHOLDER_HEIGHT = 90;

/**
 * How the reader decides which segment is "current" (old client, TextColumn.adjustHighlightedAndVisible):
 * the first segment that either reaches below the middle line, or starts at or below the threshold line.
 * Measured from the top of the scrolling column. Desktop threshold 140px, single-panel 70px; the middle
 * line is half the window height (a quarter when the connections share a mobile screen).
 */
export interface FocusRule {
  middle: number;
  threshold: number;
}

export const FOCUS_THRESHOLD = { desktop: 140, mobile: 70 } as const;

/** Where a linked segment is placed: just past the threshold, so it is unambiguously the current one. */
export const TARGET_OFFSET_PAST_THRESHOLD = 2;

export function focusRule(viewportHeight: number, opts: { mobile: boolean; connectionsOnScreen?: boolean }): FocusRule {
  return {
    middle: viewportHeight / (opts.mobile && opts.connectionsOnScreen ? 4 : 2),
    threshold: opts.mobile ? FOCUS_THRESHOLD.mobile : FOCUS_THRESHOLD.desktop,
  };
}

/** The current segment under {@link FocusRule}. `rects` are in document order, relative to the column's top. */
export function pickFocusSegment(rects: readonly SectionRect[], rule: FocusRule): string | undefined {
  // 1px tolerance: a segment placed exactly on the threshold line (e.g. a linked verse) counts as current
  // despite sub-pixel layout (139.9 vs 140).
  for (const r of rects) if (r.bottom > rule.middle || r.top >= rule.threshold - 1) return r.ref;
  return rects.at(-1)?.ref;
}

export interface SectionRect {
  ref: string;
  top: number;
  bottom: number;
}

/**
 * Which section is "current": the first whose bottom edge is below the middle of the viewport.
 * (The old client used the first *segment* past the middle, then reported its section.)
 */
export function pickVisibleSection(rects: readonly SectionRect[], viewportHeight: number): string | undefined {
  const middle = viewportHeight / 2;
  const hit = rects.find((r) => r.bottom > middle);
  return (hit ?? rects.at(-1))?.ref;
}

/** Whether another section should load because the column edge is near the viewport. */
export function needsMore(edge: { top: number; bottom: number }, viewportHeight: number, direction: "up" | "down", margin = LOAD_MARGIN): boolean {
  return direction === "up" ? edge.top > -margin : edge.bottom < viewportHeight + margin;
}

/** Next ref to load beyond the loaded sections, or undefined at the end of the book. */
export function nextToLoad(loaded: readonly { ref: string; prev: string | null; next: string | null }[], direction: "up" | "down"): string | undefined {
  const edge = direction === "up" ? loaded[0]?.prev : loaded.at(-1)?.next;
  if (!edge) return undefined;
  return loaded.some((s) => s.ref === edge) ? undefined : edge;
}

/** After prepending content, how far to scroll so the reader's place on screen doesn't move. */
export function scrollCompensation(heightBefore: number, heightAfter: number): number {
  return Math.max(0, heightAfter - heightBefore);
}

/**
 * Windowing: which sections to let go. From each end, the run of sections lying wholly more than `reach` px
 * beyond the view (stopping at the first one that is kept or not measured); then, if that would leave fewer than `minKept`, the
 * ones nearest the reader are given back until it does not. All-or-nothing was the bug: after a long read with no pause, every
 * section above qualified at once, taking them all would leave too few, so none went and the column only grew.
 */
export function sectionsToTrim(
  refs: readonly string[],
  box: (ref: string) => { top: number; bottom: number } | undefined,
  view: { top: number; bottom: number },
  reach: number,
  keep: (ref: string) => boolean,
  minKept: number,
): Set<string> {
  const above: string[] = [];
  for (const ref of refs) {
    const b = box(ref);
    if (!b || keep(ref) || b.bottom > view.top - reach) break;
    above.push(ref);
  }
  const below: string[] = [];
  for (const ref of [...refs].reverse()) {
    if (above.includes(ref)) break;
    const b = box(ref);
    if (!b || keep(ref) || b.top < view.bottom + reach) break;
    below.push(ref);
  }
  // `above` and `below` are each ordered from the column's end inward, so their last entries are the nearest the reader
  while (above.length + below.length > 0 && refs.length - above.length - below.length < minKept) {
    if (above.length >= below.length) above.pop();
    else below.pop();
  }
  return new Set([...above, ...below]);
}
