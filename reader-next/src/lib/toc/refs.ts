/**
 * Ref arithmetic the table of contents needs: does one ref contain another, going up a level, splitting a span.
 * Ported from Sefaria.refContains / zoomOutRef / splitSpanningRefNaive.
 */
import { addressToNumber } from "~/lib/ref/address";
import { formatSections, parseHumanRef, type ParsedRef } from "~/lib/ref/url";

const toNumber = (x: string): number => (/\d+[ab]/.test(x) ? addressToNumber(x, "Talmud") : Number.parseInt(x, 10));

/**
 * Does `outer` contain `inner`? Same book (or node of a complex text), and `inner` lies within `outer`'s span.
 * A ref with no sections ("Pesach Haggadah, Kadesh") contains everything in that node. Undefined when either ref is
 * missing (the old returned null).
 */
export function refContains(outer: string | undefined, inner: string | undefined): boolean | undefined {
  if (!outer || !inner) return undefined;
  const a = parseHumanRef(outer);
  const b = parseHumanRef(inner);
  if (a.title !== b.title) return false;
  const [as, ae, bs, be] = [a.sections, a.toSections, b.sections, b.toSections].map((xs) => xs.map(toNumber));
  const len = Math.min(as!.length, bs!.length);
  for (let i = 0; i < len; i++) {
    if (be![i]! > ae![i]!) return false;
    if (be![i]! < ae![i]!) break;
  }
  for (let i = 0; i < len; i++) {
    if (bs![i]! < as![i]!) return false;
    if (bs![i]! > as![i]!) break;
  }
  return true;
}

/** Go up `zoom` levels: "Zohar 1:2:3" zoomed by 1 is "Zohar 1:2". */
export function zoomOutRef(ref: string, zoom = 1): string {
  const p = parseHumanRef(ref);
  const cut: ParsedRef = { title: p.title, sections: p.sections.slice(0, -zoom), toSections: p.toSections.slice(0, -zoom) };
  return cut.sections.length ? `${cut.title} ${formatSections(cut.sections, cut.toSections)}` : cut.title;
}

/** "Genesis 1:1-6:8" → "Genesis 1:1" (the first part of a spanning ref). */
export const splitSpanningRefNaive = (ref: string): string => (ref.includes("-") ? ref.split("-")[0]! : ref);
