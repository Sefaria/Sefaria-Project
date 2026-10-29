/**
 * Locating the text a ref points at inside a fetched section. Links name segments ("Rashi on Genesis 1:1:2",
 * or a range "Mishnah Berurah 1:1-2"); the library cache holds whole sections. Fetching the *parent section*
 * once serves every comment on that verse.
 *
 * @feature CON-032 Connection item rendering
 */
import { parseHumanRef } from "~/lib/ref/url";
import type { Segment, TextPassage } from "./model";
import { isHighlighted } from "./plan";

/**
 * The ref of the section containing `ref`'s segment(s): the ref minus its last address level, when it has
 * at least two levels ("Rashi on Genesis 1:1:2" → "Rashi on Genesis 1:1"). A ref with one level (a
 * depth-1 text or a section already) is its own container, so a whole book is never requested.
 */
export function containingSectionRef(ref: string): string {
  const p = parseHumanRef(ref);
  if (p.sections.length < 2) return ref;
  const sections = p.sections.slice(0, -1);
  return `${p.title} ${sections.join(":")}`;
}

/**
 * What to fetch to show a linked ref: its containing section (shared by every link on that verse), or — for a range whose ends lie in
 * different sections ("Genesis 1:31-2:3") — the range itself, which the API answers with every segment it covers. The section of its
 * start alone lost the rest (review F10).
 */
export function loadRefFor(ref: string): string {
  const p = parseHumanRef(ref);
  const end = containingSectionRef(`${p.title} ${p.toSections.join(":")}`);
  return p.sections.length >= 2 && end !== containingSectionRef(ref) ? ref : containingSectionRef(ref);
}

/** The segments of a section that a (possibly ranged) segment ref covers. */
export function segmentsInRef(passage: Pick<TextPassage, "segments" | "addressTypes">, ref: string): Segment[] {
  const p = parseHumanRef(ref);
  if (p.sections.length === 0) return passage.segments;
  const range = { from: p.sections, to: p.toSections };
  return passage.segments.filter((s) => isHighlighted(s.address, range, passage.addressTypes));
}
