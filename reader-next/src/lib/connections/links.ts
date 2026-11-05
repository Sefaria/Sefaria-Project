/**
 * Links between a text and everything that relates to it: commentary, quotations, targum, essays, …
 * Ported from the old client's `Sefaria` link helpers (sefaria.js:1660-1770), with the same semantics.
 *
 * @feature CON-027 Link filter matching semantics
 * @feature CON-029 Sidebar filter mirrored to base text link dots
 * @feature CON-071 Related data API and caching
 */
import type { Catalog } from "~/lib/catalog/toc";

export interface RelatedLink {
  _id: string;
  index_title: string;
  /** "Commentary", "Quoting Commentary", "Targum", "Tanakh", "Essay", … (assigned by the server). */
  category: string;
  /** "commentary", "targum", "essay", "quotation_auto", "related", … */
  type: string;
  ref: string;
  anchorRef: string;
  /** Every segment ref the link attaches to. */
  anchorRefExpanded: string[];
  sourceRef: string;
  sourceHeRef: string;
  anchorVerse: number;
  sourceHasEn: boolean;
  /** Server-computed sort key for commentary on the same index (the decimal of the last two sections). */
  commentaryNum: number;
  collectiveTitle: { en: string; he: string };
  compDate?: number[];
  heTitle?: string;
  displayedText?: { en: string; he: string };
  anchorVersion?: { language: string; title: string };
  inline_reference?: { "data-commentator": string; "data-order": string; "data-label"?: string };
  isSheet?: boolean;
}

/** Same link attached via different segments of a spanning ref: keep one. */
export function dedupeLinks(links: readonly RelatedLink[]): RelatedLink[] {
  const byKey = new Map<string, RelatedLink>();
  for (const l of links) byKey.set(`${l.anchorRef}|${l.sourceRef}|${l.type}`, l);
  return [...byKey.values()];
}

/** The links that attach to any of the given segment refs. */
export function linksForRefs(links: readonly RelatedLink[], segmentRefs: readonly string[]): RelatedLink[] {
  const wanted = new Set(segmentRefs);
  return dedupeLinks(links.filter((l) => l.anchorRefExpanded.some((r) => wanted.has(r))));
}

/** Essay links are shown separately from the category summary. */
export const withoutEssays = (links: readonly RelatedLink[]) => links.filter((l) => l.type !== "essay");

export interface IndexInfo {
  categories: string[];
  primary_category?: string;
}
export type IndexLookup = (name: string) => IndexInfo | undefined;

/**
 * What we know about a book by name: the catalog entry if the name is a book, else a partial entry
 * synthesised from a link that uses it as its collective title (e.g. "Rashi" → category "Commentary").
 */
export function makeIndexLookup(catalog: Catalog | undefined, links: readonly RelatedLink[]): IndexLookup {
  const synthesised = new Map<string, IndexInfo>();
  for (const l of links) {
    const name = l.collectiveTitle.en;
    if (!synthesised.has(name)) synthesised.set(name, { categories: [l.category] });
  }
  return (name) => catalog?.books.get(name) ?? synthesised.get(name);
}

/**
 * Filter links by a connections filter (a single name, optionally with a `|Quoting` or `|Essay` suffix).
 * - empty filter: everything
 * - a commentator (e.g. "Rashi") matches only links of category Commentary
 * - `X|Quoting`: only Quoting Commentary links named X
 * - `X|Essay`: only essay links whose displayed title is X
 * - otherwise a link matches when its category or its collective title equals the filter
 */
export function filterLinks(links: readonly RelatedLink[], filter: readonly string[], lookup: IndexLookup): RelatedLink[] {
  if (filter.length === 0) return [...links];
  const [name = "", suffix] = filter[0]!.split("|");
  const isQuoting = suffix === "Quoting";
  const isEssay = suffix === "Essay";
  const info = lookup(name);
  const isCommentary = Boolean(info) && !isQuoting && (info!.categories[0] === "Commentary" || info!.primary_category === "Commentary");
  return links.filter((l) => {
    if (isCommentary && l.category !== "Commentary") return false;
    if (isQuoting && l.category !== "Quoting Commentary") return false;
    if (isEssay) return l.type === "essay" && l.displayedText?.en === name;
    return l.category === name || l.collectiveTitle.en === name;
  });
}

/**
 * Sort links for display: by anchor verse; within the same index, by the server's commentary number;
 * otherwise by source ref (Hebrew ref in Hebrew).
 */
export function sortLinks(links: readonly RelatedLink[], hebrew: boolean): RelatedLink[] {
  return [...links].sort((a, b) => {
    if (a.anchorVerse !== b.anchorVerse) return a.anchorVerse - b.anchorVerse;
    if (a.index_title === b.index_title) return a.commentaryNum - b.commentaryNum;
    const [x, y] = hebrew ? [a.sourceHeRef, b.sourceHeRef] : [a.sourceRef, b.sourceRef];
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** Number of connections a segment has, given a filter (the dot beside each verse). */
export function linkCount(links: readonly RelatedLink[], segmentRef: string, filter: readonly string[], lookup: IndexLookup): number {
  return filterLinks(
    links.filter((l) => l.anchorRefExpanded.includes(segmentRef)),
    filter,
    lookup,
  ).length;
}
