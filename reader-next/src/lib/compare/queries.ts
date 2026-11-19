/**
 * Data for the version-diff page (/compare), from the same APIs the old page and its Django view used:
 *  - the view (sefaria/views.py compare) turned the address's ref into the section to show (`secRef`), a list of sections when the
 *    ref is above section level (`refArray`), and the old page asked for the next section ("Load Next Chapter"). Here that is the
 *    name API (what kind of ref) and the texts API with firstAvailableRef (the section, its next), plus the shape API for the
 *    sections of a ref above section level (Ref.all_subrefs counts them from the text's state, which is what the shape reports);
 *  - the versions to choose from: `/api/texts/versions/<ref>` in the old page's language buckets (Sefaria._sortVersionsIntoBuckets:
 *    a title ending "[xx]" is language xx, else the version's `language`);
 *  - each table's text: the old texts API with the old page's own parameters (Sefaria.text with `vhe`/`ven`, wrapLinks 0), one call
 *    per section and version. The old page then asked again for every segment of both versions; the segments are the section's.
 *  - "Apply Change": Sefaria.postSegment, `POST /api/texts/<segment url>` with `json={versionTitle, language, text}` (moderators only,
 *    on the server).
 *
 * Differences from sefaria.org, on purpose: a segment range (`/compare/Genesis.1.3-5/...`) shows the form with no table where Django
 * answered 500 (Ref.all_subrefs of a segment range throws), and a section range (`Genesis 1-2`) shows one table per section where the
 * old page showed rows that never finished loading ("Genesis 1-2:1" is not a ref).
 *
 * @feature LEG-010 Text version diff/compare tool (/compare)
 */
import { queryOptions } from "@tanstack/react-query";
import { apiJson, SEFARIA_API_ORIGIN } from "~/lib/api/client";
import { postForm } from "~/lib/auth/http";
import { withPolicy } from "~/lib/cache/query-options";
import { refToUrl } from "~/lib/ref/url";
import type { VersionMeta } from "~/lib/text/model";
import type { CompareLang } from "./url";

export interface CompareSetup {
  /** The section shown (the view's `secRef`): "" when the address names no ref. */
  secRef: string;
  /** One table per ref when the address's ref is above section level (or a section range); null for one table of `secRef`. */
  refArray: string[] | null;
  /** The section after `secRef` (the old page's "Load Next Chapter"), or null. */
  nextChapter: string | null;
}

interface NameAnswer {
  is_ref?: boolean;
  is_book?: boolean;
  is_range?: boolean;
  ref?: string;
  url?: string;
  index?: string;
  is_segment?: boolean;
  internalSections?: number[];
  sections?: string[];
}

interface TextsAnswer {
  ref?: string;
  sectionRef?: string;
  sections?: unknown[];
  textDepth?: number;
  isSpanning?: boolean;
  spanningRefs?: string[];
  next?: string | null;
  text?: unknown;
  he?: unknown;
}

interface ShapeNode {
  title?: string;
  chapters?: unknown;
}

/** Sefaria.normRef: the ref's URL form ("Rashi on Genesis 1:1" → "Rashi_on_Genesis.1.1"), escaped for a path. */
export const normRef = (ref: string) => refToUrl(ref);
const pathRef = normRef;
const api = (path: string) => `${SEFARIA_API_ORIGIN}${path}`;

export const nameQueryUrl = (ref: string) => api(`/api/name/${encodeURIComponent(ref)}?ref_only=1&limit=0`);

/** The old page's text parameters (Sefaria.text → _textUrl) for one version of a ref. */
export function sectionTextUrl(ref: string, lang: CompareLang, versionTitle: string | null): string {
  const v = versionTitle ? `${lang === "he" ? "vhe" : "ven"}=${encodeURIComponent(versionTitle.replace(/ /g, "_")).replace(/'/g, "%27")}&` : "";
  return api(`/api/texts/${pathRef(ref)}?${v}commentary=0&context=0&pad=0&wrapLinks=0&multiple=0&stripItags=0&transLangPref=&firstAvailableRef=1&fallbackOnDefaultVersion=1`);
}

/** How many refs one level below a ref above section level (Ref.all_subrefs), from the index's shape. */
export function subrefCount(shape: ShapeNode[] | ShapeNode, ref: string, internalSections: number[]): number {
  const nodes = Array.isArray(shape) ? shape : [shape];
  // a complex text lists one entry per node: the one whose title the ref starts with (the longest)
  const node = nodes.filter((n) => n.title && (ref === n.title || ref.startsWith(n.title + " ") || ref.startsWith(n.title + ","))).sort((a, b) => b.title!.length - a.title!.length)[0] ?? nodes[0];
  let at: unknown = node?.chapters;
  for (const s of internalSections) at = Array.isArray(at) ? at[s - 1] : undefined;
  return Array.isArray(at) ? at.length : typeof at === "number" ? at : 0;
}

/** sefaria/views.py compare: the section to show, the sections when the ref is above section level, and the next section. */
export async function fetchCompareSetup(compRef: string | null, signal?: AbortSignal): Promise<CompareSetup> {
  const none: CompareSetup = { secRef: "", refArray: null, nextChapter: null };
  if (!compRef) return none;
  let name: NameAnswer;
  try {
    name = await apiJson<NameAnswer>(await fetch(nameQueryUrl(compRef), { signal }), `Name ${compRef}`);
  } catch {
    return none;
  }
  if (!name.is_ref || !name.ref) return none;
  let texts: TextsAnswer;
  try {
    texts = await apiJson<TextsAnswer>(await fetch(sectionTextUrl(compRef, "he", null), { signal }), `Text ${compRef}`);
  } catch {
    return none;
  }
  const depth = texts.textDepth ?? 0;
  // first_available_section_ref, raised to its section when it is a segment
  const firstIsSection = (texts.sections?.length ?? 0) < depth;
  const secRef = (firstIsSection ? texts.ref : texts.sectionRef) ?? texts.ref ?? "";
  let refArray: string[] | null = null;
  const level = name.sections?.length ?? 0;
  if (!name.is_book && depth && level < depth - 1) {
    // above section level: one table per ref a level down (Ref.all_subrefs)
    try {
      const shape = await apiJson<ShapeNode[] | ShapeNode>(await fetch(api(`/api/shape/${encodeURIComponent(name.index ?? "")}`), { signal }), `Shape ${name.index}`);
      const n = subrefCount(shape, name.ref, name.internalSections ?? []);
      refArray = Array.from({ length: n }, (_, i) => `${name.ref}${level ? ":" : " "}${i + 1}`);
    } catch {
      refArray = [];
    }
  } else if (!name.is_book && depth && level >= depth) {
    // a segment (or a segment range, which made Django fail): no table
    refArray = [];
  } else if (texts.isSpanning && texts.spanningRefs?.length) {
    refArray = texts.spanningRefs;
  }
  return { secRef, refArray, nextChapter: texts.next ?? null };
}

export const compareSetupQueryOptions = (compRef: string | null) =>
  queryOptions<CompareSetup>({
    ...withPolicy("catalog", {
      queryKey: ["compare", "setup", compRef ?? ""] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchCompareSetup(compRef, signal),
    }),
  });

/** Sefaria._sortVersionsIntoBuckets: the language a version is listed under. */
export const versionBucket = (v: Pick<VersionMeta, "versionTitle" | "language">) => /\[([a-z]{2,3})\]$/.exec(v.versionTitle)?.[1] ?? v.language;

/** The titles the old page's Version selects offer for a language, in the API's order. */
export const versionTitlesFor = (versions: readonly Pick<VersionMeta, "versionTitle" | "language">[], lang: string) =>
  versions.filter((v) => versionBucket(v) === lang).map((v) => v.versionTitle);

/** One version of a section, as the list of its segments' raw texts (the old page's `data.he` / `data.text`). */
export async function fetchSectionText(ref: string, lang: CompareLang, versionTitle: string, signal?: AbortSignal): Promise<string[]> {
  const d = await apiJson<TextsAnswer>(await fetch(sectionTextUrl(ref, lang, versionTitle), { signal }), `Text ${ref}`);
  const t = lang === "he" ? d.he : d.text;
  const list = Array.isArray(t) ? t : typeof t === "string" ? [t] : [];
  return list.map((s) => (typeof s === "string" ? s : Array.isArray(s) ? s.flat(Infinity).join(" ") : ""));
}

export const sectionTextQueryOptions = (ref: string, lang: CompareLang, versionTitle: string) =>
  queryOptions<string[]>({
    ...withPolicy("text", {
      queryKey: ["compare", "text", ref, lang, versionTitle] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSectionText(ref, lang, versionTitle, signal),
    }),
  });

/** What the server said to "Apply Change": `ok`, its error, or nothing (the ref is not a segment: the old page sent nothing then). */
export type ApplyResult = { status: "ok" } | { status: "error"; error: string } | { status: "skipped" };

/** Sefaria.postSegment: write a segment's new text into a version (the server allows moderators only). */
export async function postSegmentText(segRef: string, versionTitle: string, lang: CompareLang, text: string): Promise<ApplyResult> {
  let name: NameAnswer;
  try {
    name = await apiJson<NameAnswer>(await fetch(api(`/api/name/${encodeURIComponent(segRef)}?ref_only=1`)), `Name ${segRef}`);
  } catch {
    return { status: "skipped" };
  }
  if (!name.is_segment || !name.url) return { status: "skipped" };
  const r = await postForm(`/api/texts/${name.url}`, new URLSearchParams({ json: JSON.stringify({ versionTitle, language: lang, text }) }));
  if (r.data.status === "ok") return { status: "ok" };
  return { status: "error", error: typeof r.data.error === "string" ? r.data.error : r.networkError ? "Network error" : `HTTP ${r.status}` };
}
