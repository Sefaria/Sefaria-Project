/**
 * Where a linked panel goes when the other one moves (docs/WORKSPACE.md, "Linked panels"). Two texts can be linked when the reader can
 * map a segment of one to a segment of the other from data it already has:
 *
 *  - the same text (two versions or translations side by side): the same segment;
 *  - a commentary or targum and its base text (the index says `dependence` Commentary or Targum, one base title and a mapping):
 *      base → dependent: the first link from the base segment into that work (`/api/links/<section>`, cached per section); none means the
 *        dependent panel holds its place (owner decision D3);
 *      dependent → base: by structure, as sefaria.org's convertCommentaryRefToBaseRef (a many-to-one mapping drops the last section).
 *
 * Anything else (a parallel passage, two unrelated books) is not linkable: its links are sparse and many-to-many (plan P3).
 *
 * @feature SHL-090 Linked panels
 */
import { parseHumanRef, toHumanRef } from "~/lib/ref/url";
import type { CommentaryMeta } from "./commentary";
import type { RelatedLink } from "~/lib/connections/links";

/** What a link between two texts can do: the same text, or one depends on the other. */
export type LinkRelation = { mode: "same" } | { mode: "dependent"; base: "a" | "b"; dependent: DependentMeta };

/** An index that maps onto one base text. */
export type DependentMeta = CommentaryMeta & { base_text_titles: [string, ...string[]]; base_text_mapping: string };

const DEPENDENT = new Set(["Commentary", "Targum"]);

/** Does this index depend on exactly one base text, with a mapping? */
export function isDependentOn(meta: CommentaryMeta | undefined, baseTitle: string): meta is DependentMeta {
  return !!meta && DEPENDENT.has(meta.dependence ?? "") && !!meta.base_text_mapping && meta.base_text_titles?.length === 1 && meta.base_text_titles[0] === baseTitle;
}

/**
 * How two texts relate, from their index titles and records (`a`, `b` are the two panels). Null: they cannot be linked.
 * The records are only needed when the titles differ.
 */
export function relationOf(a: { title: string; meta?: CommentaryMeta }, b: { title: string; meta?: CommentaryMeta }): LinkRelation | null {
  if (!a.title || !b.title) return null;
  if (a.title === b.title) return { mode: "same" };
  if (isDependentOn(b.meta, a.title)) return { mode: "dependent", base: "a", dependent: b.meta };
  if (isDependentOn(a.meta, b.title)) return { mode: "dependent", base: "b", dependent: a.meta };
  return null;
}

/** The first segment of a ref that may be a range ("Rashi on Genesis 1:3:1-2" → "Rashi on Genesis 1:3:1"). */
export function firstSegment(ref: string): string {
  const p = parseHumanRef(ref);
  if (!p.sections.length) return ref;
  return toHumanRef({ title: p.title, sections: p.sections, toSections: p.sections });
}

/** A dependent segment ("Rashi on Genesis 1:3:2", "Onkelos Genesis 1:3") → its base segment ("Genesis 1:3"). */
export function dependentToBase(ref: string, dep: DependentMeta): string | null {
  const p = parseHumanRef(firstSegment(ref));
  if (p.title !== dep.title || !p.sections.length) return null;
  const base = dep.base_text_titles[0];
  const manyToOne = dep.base_text_mapping.startsWith("many_to_one");
  const sections = manyToOne && p.sections.length > 1 ? p.sections.slice(0, -1) : p.sections;
  return toHumanRef({ title: base, sections, toSections: sections });
}

/**
 * A base segment → the first segment of the dependent work attached to it, from the base section's links; null when the work says
 * nothing on that segment (the dependent panel then holds its place). Comments are taken in the server's order (commentaryNum), as the
 * sidebar lists them.
 */
export function baseToDependent(segmentRef: string, dep: DependentMeta, links: readonly RelatedLink[]): string | null {
  let best: RelatedLink | undefined;
  for (const l of links) {
    const anchors = l.anchorRefExpanded.length ? l.anchorRefExpanded : [l.anchorRef];
    if (!anchors.includes(segmentRef)) continue;
    if (parseHumanRef(l.sourceRef).title !== dep.title) continue;
    // Only a comment that stands on this passage: one whose own place is among the verses it is attached to. A comment elsewhere that
    // quotes the verse (Rashi on Genesis 1:1:3 cites Genesis 2:4) is linked to it too, and would throw the panel to another chapter.
    const home = dependentToBase(l.sourceRef, dep);
    if (!home || !anchors.includes(home)) continue;
    if (!best || order(l) < order(best)) best = l;
  }
  return best ? firstSegment(best.sourceRef) : null;
}
const order = (l: RelatedLink) => (Number.isFinite(l.commentaryNum) ? l.commentaryNum : Number.MAX_SAFE_INTEGER);

/** The section of a segment ref ("Genesis 1:3" → "Genesis 1"; "Berakhot 2a:3" → "Berakhot 2a"). */
export function sectionOf(segmentRef: string): string {
  const p = parseHumanRef(firstSegment(segmentRef));
  if (p.sections.length < 2) return segmentRef;
  const s = p.sections.slice(0, -1);
  return toHumanRef({ title: p.title, sections: s, toSections: s });
}
