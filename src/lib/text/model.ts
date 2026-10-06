/**
 * Normalised text model for the reader.
 *
 * A Sefaria v3 texts response carries the requested passage as nested arrays whose depth depends on
 * the book (Tanakh: chapter → verses; commentary: chapter → verse → comments; spanning refs: one array
 * per section). This module flattens any response into a list of addressed segments, each with its
 * exact ref, so every book type renders through the same components.
 *
 * @feature TXD-010 Build numbered segments from text data
 * @feature TXD-043 TXT-022 Every book type normalises to the same segment model
 */
import { nextAddress } from "~/lib/ref/address";

/** Fields of a v3 version we use. The API returns more; extra fields are ignored. */
export interface VersionMeta {
  versionTitle: string;
  versionTitleInHebrew?: string;
  shortVersionTitle?: string;
  shortVersionTitleInHebrew?: string;
  language: string;
  actualLanguage: string;
  languageFamilyName: string;
  direction: "rtl" | "ltr";
  isSource: boolean;
  isPrimary: boolean;
  license?: string;
  versionSource?: string;
  versionNotes?: string;
  versionNotesInHebrew?: string;
  formatAsPoetry?: boolean | string;
  digitizedBySefaria?: boolean | string;
  priority?: number | string;
}

export type RawText = string | RawText[];

export interface RawVersion extends VersionMeta {
  text: RawText;
}

/** Subset of the v3 response the model relies on. */
export interface RawTextsResponse {
  ref: string;
  heRef: string;
  sections: string[];
  toSections: string[];
  sectionRef: string;
  heSectionRef: string;
  firstAvailableSectionRef?: string;
  isSpanning: boolean;
  spanningRefs?: string[];
  next: string | null;
  prev: string | null;
  title: string;
  book: string;
  heTitle: string;
  primary_category: string;
  type?: string;
  indexTitle: string;
  heIndexTitle: string;
  categories: string[];
  isComplex: boolean;
  isDependant: boolean;
  collectiveTitle?: string;
  heCollectiveTitle?: string;
  textDepth: number;
  sectionNames: string[];
  heSectionNames?: string[];
  addressTypes: string[];
  lengths?: number[];
  alts?: RawAlts;
  versions: RawVersion[];
  available_versions?: VersionMeta[];
  warnings?: unknown[];
}

/** A structure boundary that starts at a segment: a parasha, an aliyah, a Psalms day, a chapter of a Talmud tractate… */
export interface AltMarker {
  en?: string[];
  he?: string[];
  /** True when this segment starts a whole node (e.g. the first verse of a parasha). */
  whole?: boolean;
  aliyah_en?: string;
  aliyah_he?: string;
  parasha_en?: string;
  parasha_he?: string;
  [key: string]: unknown;
}

export type RawAlts = (AltMarker | null | RawAlts)[];

export interface Segment {
  /** Full ref of this segment, e.g. "Genesis 1:3", "Rashi on Genesis 1:1:2", "Pesach Haggadah, Kadesh 2". */
  ref: string;
  /** Address within the book, e.g. ["1", "3"], ["2a", "4"]. */
  address: string[];
  /** Ref of the display section this segment belongs to (e.g. "Genesis 1", "Rashi on Genesis 1:1"). */
  sectionRef: string;
  /** Raw HTML per side; undefined when that version has no entry at this address. */
  primary?: string;
  translation?: string;
  /** Structure boundary starting here (parasha / aliyah / day / chapter), when the API reports one. */
  alt?: AltMarker;
}

export interface TextPassage {
  ref: string;
  heRef: string;
  sectionRef: string;
  heSectionRef: string;
  /** Display sections covered (one, or several for spanning refs). */
  sectionRefs: string[];
  book: string;
  indexTitle: string;
  heIndexTitle: string;
  categories: string[];
  primaryCategory: string;
  isComplex: boolean;
  isDependant: boolean;
  isSpanning: boolean;
  collectiveTitle?: string;
  textDepth: number;
  sectionNames: string[];
  addressTypes: string[];
  sections: string[];
  toSections: string[];
  next: string | null;
  prev: string | null;
  firstAvailableSectionRef?: string;
  primaryVersion?: VersionMeta;
  translationVersion?: VersionMeta;
  availableVersions: VersionMeta[];
  segments: Segment[];
  warnings: unknown[];
}

const stripText = <T extends RawVersion>({ text: _t, ...meta }: T): VersionMeta => meta;

function joinAddress(book: string, address: string[]): string {
  return address.length ? `${book} ${address.join(":")}` : book;
}

interface Leaf<T> {
  address: string[];
  value: T;
}

type Tree<T> = T | Tree<T>[];

/**
 * Walk a nested array, assigning an address to every leaf. `start` is the address of the first
 * element at each level (taken from the response's `sections`); later siblings count up from it at the
 * outermost varying level and from 1 at deeper levels. Works for text (leaves are strings) and for
 * `alts` (leaves are markers or null), which share the text's shape.
 */
function flatten<T>(tree: Tree<T>, prefix: string[], start: string[], types: string[], out: Leaf<T>[]): void {
  if (!Array.isArray(tree)) {
    out.push({ address: prefix, value: tree });
    return;
  }
  const level = prefix.length;
  const type = types[level];
  let addr = start[level] ?? (type === "Talmud" ? "2a" : "1");
  tree.forEach((child, i) => {
    if (i > 0) addr = nextAddress(addr, type);
    // Only the first child inherits the requested start for deeper levels.
    flatten(child, [...prefix, addr], i === 0 ? start : [], types, out);
  });
}

/** Leaves of a text-shaped tree for one response, with their addresses. */
function leavesOf<T>(raw: RawTextsResponse, tree: Tree<T> | undefined): Leaf<T>[] {
  if (tree === undefined) return [];
  const out: Leaf<T>[] = [];
  const types = raw.addressTypes ?? [];
  const depth = raw.textDepth;
  const given = raw.sections ?? [];
  if (!Array.isArray(tree)) {
    // A single segment was requested.
    out.push({ address: given, value: tree });
    return out;
  }
  if (raw.isSpanning && raw.spanningRefs?.length) {
    // Text is one array per spanned section. Each spanned ref gives its own start address.
    tree.forEach((part, i) => {
      const spanRef = raw.spanningRefs![i];
      const spanSections = spanRef ? spanRef.slice(raw.book.length).trim().split(":").filter(Boolean) : [];
      flatten(part, spanSections, spanSections, types, out);
    });
    return out;
  }
  // The array represents the levels below the deepest *fixed* address. A ranged ref at segment level
  // ("Genesis 1:1-5") fixes the chapter; the varying level starts at sections[last].
  const fixedLevels = sectionsFixed(given, raw.toSections ?? given, depth);
  flatten(tree, given.slice(0, fixedLevels), given, types, out);
  return out;
}

/** Number of leading address levels that are the same for start and end (i.e. not iterated by the array). */
function sectionsFixed(sections: string[], toSections: string[], depth: number): number {
  let i = 0;
  while (i < sections.length && sections[i] === toSections[i]) i++;
  // When all requested levels are equal, the array iterates the next level down.
  // When the request is ranged at level i, the array iterates level i.
  return Math.min(i, depth - 1);
}

/** Display section of a segment address: everything but the last level. */
function sectionOf(book: string, address: string[]): string {
  return joinAddress(book, address.slice(0, -1));
}

function pickVersion(raw: RawTextsResponse, role: "primary" | "translation"): RawVersion | undefined {
  const vs = raw.versions ?? [];
  if (role === "primary") return vs.find((v) => v.isPrimary) ?? vs.find((v) => v.isSource);
  return vs.find((v) => !v.isPrimary);
}

export function normaliseTexts(raw: RawTextsResponse): TextPassage {
  const primary = pickVersion(raw, "primary");
  const translation = pickVersion(raw, "translation");
  const byAddress = new Map<string, Segment>();
  const order: string[] = [];
  const add = (leaf: Leaf<string>, side: "primary" | "translation") => {
    const key = leaf.address.join(":");
    let seg = byAddress.get(key);
    if (!seg) {
      seg = {
        ref: joinAddress(raw.book, leaf.address),
        address: leaf.address,
        sectionRef: sectionOf(raw.book, leaf.address),
      };
      byAddress.set(key, seg);
      order.push(key);
    }
    seg[side] = leaf.value;
  };
  leavesOf<string>(raw, primary?.text).forEach((l) => add(l, "primary"));
  leavesOf<string>(raw, translation?.text).forEach((l) => add(l, "translation"));
  // Alt-structure markers share the text's shape; attach each to the segment it starts at.
  for (const leaf of leavesOf<AltMarker | null>(raw, raw.alts as Tree<AltMarker | null> | undefined)) {
    const marker = leaf.value;
    if (marker && typeof marker === "object") {
      const seg = byAddress.get(leaf.address.join(":"));
      if (seg) seg.alt = marker;
    }
  }
  const segments = order.map((k) => byAddress.get(k)!);
  const sectionRefs = [...new Set(segments.map((s) => s.sectionRef))];
  return {
    ref: raw.ref,
    heRef: raw.heRef,
    sectionRef: raw.sectionRef,
    heSectionRef: raw.heSectionRef,
    sectionRefs: sectionRefs.length ? sectionRefs : [raw.sectionRef],
    book: raw.book,
    indexTitle: raw.indexTitle,
    heIndexTitle: raw.heIndexTitle,
    categories: raw.categories,
    primaryCategory: raw.primary_category,
    isComplex: raw.isComplex,
    isDependant: raw.isDependant,
    isSpanning: raw.isSpanning,
    collectiveTitle: raw.collectiveTitle || undefined,
    textDepth: raw.textDepth,
    sectionNames: raw.sectionNames,
    addressTypes: raw.addressTypes,
    sections: raw.sections,
    toSections: raw.toSections,
    next: raw.next,
    prev: raw.prev,
    firstAvailableSectionRef: raw.firstAvailableSectionRef,
    primaryVersion: primary && stripText(primary),
    translationVersion: translation && stripText(translation),
    availableVersions: raw.available_versions ?? [],
    segments,
    warnings: raw.warnings ?? [],
  };
}

/** A segment has visible content when either side has non-whitespace text. */
export function hasContent(seg: Segment): boolean {
  return Boolean(seg.primary?.trim() || seg.translation?.trim());
}
