import type { RelatedLink } from "~/lib/connections/links";
import { expandRange } from "~/lib/connections/related";

/** "Genesis 1:3" → "Genesis 1", "Rashi on Genesis 1:3:2" → "Rashi on Genesis 1:3" (the section whose links cover the segment). */
export function sectionOfSegment(segmentRef: string): string {
  const i = segmentRef.lastIndexOf(":");
  return i > 0 ? segmentRef.slice(0, i) : segmentRef;
}

/**
 * The segments of `targetBook` that correspond to `segmentRef` in another book, read from that segment's links:
 * Genesis 1:3 → Rashi on Genesis 1:3:1, 1:3:2; and back, Rashi on Genesis 1:3:2 → Genesis 1:3.
 * The same book (another version side by side) corresponds verse for verse.
 */
export function linkedSegmentsIn(links: readonly RelatedLink[], segmentRef: string, sourceBook: string, targetBook: string): string[] {
  if (sourceBook === targetBook) return [segmentRef];
  const out: string[] = [];
  for (const l of links) {
    if (l.index_title !== targetBook || !l.anchorRefExpanded.includes(segmentRef)) continue;
    for (const r of expandRange(l.sourceRef)) if (!out.includes(r)) out.push(r);
  }
  return out;
}
