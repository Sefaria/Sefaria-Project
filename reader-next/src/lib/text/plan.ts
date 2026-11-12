/**
 * Display planning: given a requested ref and what we know about its book, decide which display
 * sections to show and which segments to highlight — without the network when the book is known.
 *
 * Mirrors the old server's rules (reader/views.py catchall, inv_01 §3.1):
 *  - a ref above section level (a book, a commentary chapter) goes to the first available section;
 *  - a section ref shows that section;
 *  - a segment or segment range shows its section(s) and highlights the segments.
 *
 * @feature TXD-003 Super-section refs open the first available section
 * @feature TXD-050 Segment and range refs highlight segments within their section
 */
import { addressToNumber, nextAddress } from "~/lib/ref/address";
import { parseHumanRef } from "~/lib/ref/url";

/** What the cache remembers about a book (or complex-text node) after any fetch. */
export interface BookMeta {
  /** Exact `book` string from the API (node title for complex texts). */
  book: string;
  indexTitle: string;
  textDepth: number;
  addressTypes: string[];
  sectionNames: string[];
  isComplex: boolean;
}

export interface Highlight {
  from: string[];
  to: string[];
}

export type DisplayPlan =
  | { kind: "sections"; sectionRefs: string[]; highlight: Highlight | null; canonicalRef: string }
  /** Needs the API (unknown book, super-section ref, or a range we can't enumerate). */
  | { kind: "resolve" };

const sameArray = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function sectionRefOf(book: string, address: string[]): string {
  return address.length ? `${book} ${address.join(":")}` : book;
}

/** Enumerate section addresses from `from` to `to` that differ only in their last level. */
function enumerateSections(from: string[], to: string[], types: string[]): string[][] | null {
  if (from.length === 0) return [[]];
  const head = from.slice(0, -1);
  if (!sameArray(head, to.slice(0, -1))) return null;
  const level = from.length - 1;
  const type = types[level];
  const out: string[][] = [];
  let cur = from[level]!;
  const end = addressToNumber(to[level]!, type);
  if (Number.isNaN(end) || addressToNumber(cur, type) > end) return null;
  for (let guard = 0; guard < 500; guard++) {
    out.push([...head, cur]);
    if (addressToNumber(cur, type) >= end) return out;
    cur = nextAddress(cur, type);
  }
  return null;
}

export function planDisplay(ref: string, meta: BookMeta | undefined): DisplayPlan {
  if (!meta) return { kind: "resolve" };
  const p = parseHumanRef(ref);
  if (p.title !== meta.book) return { kind: "resolve" };
  const depth = meta.textDepth;
  const sectionLevel = Math.max(depth - 1, 0);
  const level = p.sections.length;
  const ranged = !sameArray(p.sections, p.toSections);

  if (level < sectionLevel || level > depth) return { kind: "resolve" };

  if (level === sectionLevel) {
    const secs = ranged ? enumerateSections(p.sections, p.toSections, meta.addressTypes) : [p.sections];
    if (!secs) return { kind: "resolve" };
    return { kind: "sections", sectionRefs: secs.map((a) => sectionRefOf(meta.book, a)), highlight: null, canonicalRef: ref };
  }

  // Segment level.
  const fromSection = p.sections.slice(0, -1);
  const toSection = p.toSections.slice(0, -1);
  const secs = enumerateSections(fromSection, toSection, meta.addressTypes);
  if (!secs) return { kind: "resolve" };
  return {
    kind: "sections",
    sectionRefs: secs.map((a) => sectionRefOf(meta.book, a)),
    highlight: { from: p.sections, to: p.toSections },
    canonicalRef: ref,
  };
}

/** Is a segment address within the highlight range (inclusive)? */
export function isHighlighted(address: string[], h: Highlight | null, types: string[]): boolean {
  if (!h) return false;
  const cmp = (a: string[], b: string[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const d = addressToNumber(a[i]!, types[i]) - addressToNumber(b[i]!, types[i]);
      if (d) return d;
    }
    return 0;
  };
  return cmp(address, h.from) >= 0 && cmp(address, h.to) <= 0;
}
