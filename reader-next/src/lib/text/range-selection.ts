/**
 * Ranges and multi-segment selection, as the old reader does them (owner decision 2026-11-10: legacy parity; VERIFIED on
 * www.sefaria.org the same day, scripts in the lane-D report):
 *
 *  - A pasted range that crosses sections (Genesis 1:30-2:3, Berakhot 2b:5-3a:2, Rashi on Genesis 1:31:1-2:2:1) stays in the address
 *    and every segment in it is highlighted (blue), with the sidebar open or closed.
 *  - A pasted range inside one section (Genesis 1:3-5) collapses to its first segment, unhighlighted unless the sidebar is open
 *    (unchanged; a Torah portion or aliyah is kept and highlighted).
 *  - A range of whole sections (Genesis 6-8; a commentary's verses, Rashi on Exodus 3:1-4:10) highlights all of it; without the
 *    sidebar the address is rewritten to its segments (Genesis.6.1-8.22), with the sidebar it is left as asked.
 *  - Selecting text across several segments highlights them (blue) whether or not the sidebar is open, and never opens it. With the
 *    sidebar open the address becomes the range; with it closed, the address becomes the range only when the range lies in the
 *    section being read (the old history rule: the highlighted ref when it and the currently visible section contain one another),
 *    otherwise it is left alone. The entry is replaced, never added.
 *  - Reading on (scrolling to another verse) drops the highlight and the address follows the verse.
 *
 * The client builds a range only from segment refs the server gave (the first and the last), and an address only by cutting a
 * segment ref at its section's `book` string, which the server sent too (wiki ref-resolution.md).
 */
import type { Highlight } from "./plan";
import type { TextPassage } from "./model";

/** "Genesis 1:30" + "Genesis 2:2" → "Genesis 1:30-2:2" (the old normRef of a list of segment refs). */
export function rangeOf(refs: readonly string[]): string | undefined {
  if (!refs.length) return undefined;
  const first = refs[0]!;
  const last = refs[refs.length - 1]!;
  if (refs.length === 1 || first === last) return first;
  let i = 0;
  while (i < first.length && first[i] === last[i]) i++;
  while (i > 0 && first[i - 1] !== " " && first[i - 1] !== ":") i--;
  return i > 0 && i < last.length ? `${first}-${last.slice(i)}` : undefined;
}

/** A segment's address in its book ("Rashi on Genesis 1:31:1" in "Rashi on Genesis" → ["1","31","1"]); undefined for another book. */
export function addressIn(ref: string, book: string): string[] | undefined {
  return ref.startsWith(`${book} `) ? ref.slice(book.length + 1).split(":") : undefined;
}

/** The highlight covering selected segments, first to last, in `book`. */
export function highlightOf(refs: readonly string[], book: string): Highlight | null {
  const from = refs[0] && addressIn(refs[0], book);
  const to = refs.length ? addressIn(refs[refs.length - 1]!, book) : undefined;
  return from && to ? { from, to } : null;
}

/** Does a range arriving in the address stay there (highlighted), rather than collapse to its first segment? */
export function keepsRange(a: { segments: number; sections: number; portion: boolean }): boolean {
  return a.segments > 1 && (a.portion || a.sections > 1);
}

/**
 * A range of whole sections (no segment named): the highlight over all their segments and the same range written by its segments,
 * from the loaded sections. Null when not every section is loaded or the address names segments.
 */
export function wholeSectionRange(sectionRefs: readonly string[], passages: readonly TextPassage[]): { highlight: Highlight; ref: string } | null {
  if (sectionRefs.length < 2) return null;
  const loaded = sectionRefs.map((r) => passages.find((p) => p.ref === r));
  if (loaded.some((p) => !p || !p.segments.length)) return null;
  const firstSeg = loaded[0]!.segments[0]!;
  const lastSeg = loaded[loaded.length - 1]!.segments.at(-1)!;
  const ref = rangeOf([firstSeg.ref, lastSeg.ref]);
  return ref ? { highlight: { from: firstSeg.address, to: lastSeg.address }, ref } : null;
}

/**
 * What a selection of several segments writes to the address: the range, or nothing (the address stays). `sectionSegments` are the
 * segments of the section being read.
 */
export function selectionAddress(refs: readonly string[], o: { sidebarOpen: boolean; sectionSegments: readonly string[] }): string | undefined {
  if (refs.length < 2) return undefined;
  if (o.sidebarOpen) return rangeOf(refs);
  const inSection = new Set(o.sectionSegments);
  return refs.every((r) => inSection.has(r)) ? rangeOf(refs) : undefined;
}
