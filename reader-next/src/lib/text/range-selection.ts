/**
 * Ranges and multi-segment selection, as the old reader does them (owner decision 2026-11-10: legacy parity; VERIFIED on
 * www.sefaria.org the same day):
 *
 *  - A pasted range that crosses sections (Genesis 1:30-2:3, Berakhot 2b:5-3a:2, Rashi on Genesis 1:31:1-2:2:1) stays in the address
 *    and every segment in it is highlighted (blue), with the sidebar open or closed.
 *  - A pasted range inside one section (Genesis 1:3-5, Berakhot 5a:3-6) stays and is highlighted too (owner 2026-11-10: the old
 *    reader's occasional collapse of such a range is a race, not ported).
 *  - A range of whole sections (Genesis 6-8; a daf without its amud, Berakhot 2 = 2a-2b; Genesis 1-50) highlights all of it at once;
 *    without the sidebar the address is rewritten to its segments (Genesis.6.1-8.22, Berakhot.2a.1-2b.19, Genesis.1.1-50.26) once the
 *    last section's length is known (one request when it is not among the sections loaded with the page); with the sidebar it is left
 *    as the range of sections (Berakhot.2a-2b).
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
import { isRangedRef, parseHumanRef } from "~/lib/ref/url";

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

/**
 * Does a range arriving in the address stay there, highlighted? Every range of several segments does, within one section or across
 * sections, sidebar open or closed (owner 2026-11-10). The old reader sometimes collapses one inside a section (/Genesis.1.3-5: three
 * blue segments at 3.5 s, one by 8 s): a stray scroll event runs adjustHighlightedAndVisible (static/js/TextColumn.jsx) and the
 * history writes the segment (ReaderApp.jsx). A race, not ported.
 */
export function keepsRange(a: { segments: number }): boolean {
  return a.segments > 1;
}

/**
 * A range of whole sections (no segment named: "Genesis 6-8", "Berakhot 2a-2b", "Genesis 1-50"): highlighted from its first segment to
 * the end of its last section at once (by address: `isHighlighted` compares only as deep as `to`, so the sections the column loads
 * later are blue as they arrive), and written by its segments ("Genesis 1:1-50:26") once its last section's length is known, as
 * sefaria.org does (VERIFIED 2026-11-10: /Genesis.1-50 → /Genesis.1.1-50.26 with every verse blue; it writes the address before any
 * text shows, from the server, then loads all fifty chapters). Here the last section is one request (`lastSection`), fetched by the
 * panel when the address is to be rewritten; until it arrives the address stays as typed (`ref` undefined). `passages` are what is
 * loaded: the first section, and the last when it is in hand. Null when the address names segments or is not a range.
 */
export function wholeSectionRange(
  rangeRef: string,
  firstSectionRef: string | undefined,
  passages: readonly (TextPassage | undefined)[],
): { highlight: Highlight; lastSection: string; ref?: string } | null {
  if (!isRangedRef(rangeRef)) return null;
  const asked = parseHumanRef(rangeRef);
  const end = asked.toSections;
  const first = passages.find((p) => p?.ref === firstSectionRef);
  const firstSeg = first?.segments[0];
  if (!first || !firstSeg || !end.length || firstSeg.address.length !== end.length + 1) return null;
  // the section's ref by the codec's title (a complex text's node, "Pesach Haggadah, Kadesh"), as the planner names sections, not the
  // passage's book ("Pesach Haggadah")
  const lastSection = `${asked.title} ${end.join(":")}`;
  const lastSeg = passages.find((p) => p?.ref === lastSection)?.segments.at(-1);
  const lastKnown = !!lastSeg && lastSeg.address.slice(0, -1).join(":") === end.join(":");
  const highlight = { from: firstSeg.address, to: lastKnown ? lastSeg.address : end };
  const ref = lastKnown ? rangeOf([firstSeg.ref, lastSeg.ref]) : undefined;
  return { highlight, lastSection, ...(ref ? { ref } : {}) };
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
