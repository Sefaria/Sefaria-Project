/** Where a preview card sits: fixed to the viewport, below its link or, when there is no room, above it (`bottom`). */
export interface CardPosition {
  left: number;
  top?: number;
  bottom?: number;
}

export const CARD_WIDTH = 380;
export const CARD_MAX_HEIGHT = 340;
const GAP = 6;
const MARGIN = 16;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** Place a card next to the rectangle of the link it previews, kept inside the viewport. */
export function placeCard(anchor: { top: number; bottom: number; left: number }, viewport: { width: number; height: number }): CardPosition {
  const width = Math.min(CARD_WIDTH, viewport.width - 2 * MARGIN);
  const left = clamp(anchor.left, MARGIN, Math.max(MARGIN, viewport.width - width - MARGIN));
  const below = viewport.height - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  if (below >= CARD_MAX_HEIGHT || below >= above) return { left, top: anchor.bottom + GAP };
  return { left, bottom: viewport.height - anchor.top + GAP };
}

/** A dragged card: its new top-left corner, kept on screen by at least a grab-able strip. */
export function dragTo(start: { left: number; top: number }, delta: { x: number; y: number }, viewport: { width: number; height: number }): CardPosition {
  return {
    left: clamp(start.left + delta.x, MARGIN - CARD_WIDTH + 60, viewport.width - 60),
    top: clamp(start.top + delta.y, 0, viewport.height - 40),
  };
}
