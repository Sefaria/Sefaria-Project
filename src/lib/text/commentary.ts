/**
 * Opening a commentary in the reader as its base text with the commentary alongside: "Rashi on Genesis 1:1:4"
 * opens Genesis 1:1 with Rashi in the sidebar (`?with=Rashi`).
 *
 * VERIFIED on sefaria.org (2026-10-05): this happens when a commentary ref is opened from inside the app
 * (a citation, a link, search) — loading the commentary's URL directly reads it as its own text (TXT-016).
 * Section-level refs (depth < 3) are not converted unless forced. Ported from Sefaria.isCommentaryRefWithBaseText,
 * convertCommentaryRefToBaseRef and getBaseRefAndFilter (static/js/sefaria/sefaria.js).
 *
 * @feature TXT-015 Commentary opens as base text with connection
 * @feature SHL-045 Commentary ref opens as base text plus commentary
 * @feature RTE-063 Commentary URL converts to base text plus filter
 */
import { queryOptions } from "@tanstack/react-query";
import { index } from "@vendor/sefaria-toolkit/client/index";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { withPolicy } from "~/lib/cache/query-options";
import { parseHumanRef, toHumanRef } from "~/lib/ref/url";

/** The parts of an index record that decide the conversion (same fields in the TOC and /api/v2/raw/index). */
export interface CommentaryMeta {
  /** The text's corpora ("Tanakh", "Bavli"…); the first is the one version preferences are kept by. */
  corpora?: string[];
  title: string;
  dependence?: string;
  base_text_titles?: string[];
  base_text_mapping?: string;
  /** TOC spelling */
  collectiveTitle?: string;
  /** /api/v2/raw/index spelling */
  collective_title?: string;
}

export const isCommentaryWithBaseText = (book: CommentaryMeta | undefined): book is CommentaryMeta & { base_text_titles: [string] } =>
  book?.dependence === "Commentary" && !!book.base_text_mapping && book.base_text_titles?.length === 1;

/** The title the ref belongs to, when it is a commentary ref we can convert ("Rashi on Genesis"). */
export const commentaryTitleOf = (ref: string): string => parseHumanRef(ref).title;

/**
 * The base-text ref and sidebar filter for a commentary ref, or null when it opens as its own text.
 * `force` converts section-level refs too (old `forceOpenCommentaryPanel`).
 */
export function commentaryToBase(ref: string, book: CommentaryMeta | undefined, opts: { force?: boolean } = {}): { ref: string; filter: string } | null {
  const p = parseHumanRef(ref);
  if (!opts.force && p.sections.length < 3) return null;
  if (!isCommentaryWithBaseText(book) || book.title !== p.title) return null;
  const base = book.base_text_titles[0];
  const manyToOne = book.base_text_mapping!.startsWith("many_to_one");
  const drop = p.sections.length > 2 && manyToOne;
  const baseRef = toHumanRef({
    title: base,
    sections: drop ? p.sections.slice(0, -1) : p.sections,
    toSections: drop ? p.toSections.slice(0, -1) : p.toSections,
  });
  const filter = book.collectiveTitle ?? book.collective_title;
  return filter ? { ref: baseRef, filter } : { ref: baseRef, filter: "" };
}

/** A book's index record (small; cached like the catalog). */
export const indexMetaQueryOptions = (title: string) =>
  queryOptions<CommentaryMeta>({
    ...withPolicy("catalog", {
      queryKey: ["catalog", "index", title] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<CommentaryMeta> => {
        const r = await index.getV2Index({ client: getSefariaClient(), path: { index_title: title }, signal });
        return unwrap(r, `Index ${title}`) as unknown as CommentaryMeta;
      },
    }),
  });
