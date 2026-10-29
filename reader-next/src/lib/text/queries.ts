/**
 * Text queries: the reader's entry point to the library cache.
 *
 * Texts are cached per *display section* and version selection. A ref is turned into a plan (which
 * sections, which highlight) by {@link planDisplay}; only unknown books or super-section refs need an
 * extra API round trip, and what that trip teaches us is remembered in the {@link RefIndex}.
 *
 * @feature TXD-003 TextRange load, redirect and prefetch
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { text } from "@vendor/sefaria-toolkit/client/runtime";
import { getSefariaClient, unwrap } from "~/lib/api/client";
import { PUBLIC_CONFIG } from "~/lib/config";
import { withPolicy } from "~/lib/cache/query-options";
import { RefIndex } from "~/lib/cache/ref-index";
import { parseHumanRef, isRangedRef, toHumanRef } from "~/lib/ref/url";
import { normaliseTexts, type RawTextsResponse, type TextPassage } from "./model";
import { planDisplay, type BookMeta, type Highlight } from "./plan";

/**
 * Which versions to show. Values follow the v3 `version` parameter: a language family ("english",
 * "french") or "family|Version Title". Omitted means Sefaria's default primary/translation.
 */
export interface VersionSelection {
  primary?: string;
  translation?: string;
}

export function versionParams(sel: VersionSelection): string[] {
  return [sel.primary ?? "primary", sel.translation ?? "translation"];
}

export function selectionKey(sel: VersionSelection): string {
  return `${sel.primary ?? ""}~${sel.translation ?? ""}`;
}

const passageQuery = (sel: VersionSelection) => ({
  version: versionParams(sel),
  // Same as the old client: fill gaps in a version from other versions of the same language.
  fill_in_missing_segments: "1" as const,
  return_format: "wrap_all_entities" as const,
});

/**
 * The exact URL {@link fetchPassage} requests, so the server can ask the browser to start fetching the
 * neighbouring sections (`<link rel="preload" as="fetch">`) while the app's code is still loading. The
 * browser only reuses a preloaded response when the URL matches byte for byte; a test keeps them in step.
 */
export function passageUrl(ref: string, sel: VersionSelection = {}): string {
  // Encoded as the generated client does (encodeURIComponent: spaces as %20, not URLSearchParams' "+").
  const q = Object.entries(passageQuery(sel)).flatMap(([k, v]) => [v].flat().map((x) => `${k}=${encodeURIComponent(x)}`));
  // the browser fetches it, so the public origin — not the server's internal one (Varnish in the cluster)
  return `${PUBLIC_CONFIG.apiOrigin}/api/v3/texts/${encodeURIComponent(ref)}?${q.join("&")}`;
}

export async function fetchPassage(ref: string, sel: VersionSelection, signal?: AbortSignal): Promise<TextPassage> {
  const result = await text.getV3Texts({
    client: getSefariaClient(),
    path: { tref: ref },
    query: passageQuery(sel),
    signal,
  });
  return normaliseTexts(unwrap(result, `Text ${ref}`) as unknown as RawTextsResponse);
}

export const textQueryKey = (ref: string, sel: VersionSelection) => ["text", ref, selectionKey(sel)] as const;

export function textQueryOptions(ref: string, sel: VersionSelection = {}) {
  return queryOptions<TextPassage, Error, TextPassage, ReturnType<typeof textQueryKey>>({
    ...withPolicy("text", {
      queryKey: textQueryKey(ref, sel),
      queryFn: ({ signal }: { signal: AbortSignal }): Promise<TextPassage> => fetchPassage(ref, sel, signal),
    }),
  });
}

export function metaFromPassage(p: TextPassage): BookMeta {
  return {
    book: p.book,
    indexTitle: p.indexTitle,
    textDepth: p.textDepth,
    addressTypes: p.addressTypes,
    sectionNames: p.sectionNames,
    isComplex: p.isComplex,
  };
}

export interface ReaderPassage {
  /** The ref the reader should show in the URL (canonical spelling). */
  canonicalRef: string;
  sections: TextPassage[];
  highlight: Highlight | null;
}

/**
 * Load everything the reader needs to display `ref`, using cache layers in order
 * (memory → IndexedDB → network) and learning book metadata/aliases along the way.
 */
export async function loadReaderPassage(
  qc: QueryClient,
  refIndex: RefIndex,
  requestedRef: string,
  sel: VersionSelection = {},
): Promise<ReaderPassage> {
  const ref = (await refIndex.resolveAlias(requestedRef)) ?? requestedRef;
  let plan = planDisplay(ref, await refIndex.getMeta(parseHumanRef(ref).title));
  let canonicalRef = ref;

  // A range in a book not met yet: learn the book's shape from the range's first point (one verse), then plan its sections, rather
  // than download the whole range (Genesis 1:1-10:5: ten chapters) before the first-sections cap applies (review F09). Shapes the
  // planner cannot enumerate (a commentary range across chapters) still ask the API for the range below.
  if (plan.kind === "resolve" && isRangedRef(ref)) {
    const asked = parseHumanRef(ref);
    const startRef = toHumanRef({ title: asked.title, sections: asked.sections, toSections: asked.sections });
    const start = asked.sections.length ? await qc.fetchQuery(textQueryOptions(startRef, sel)).catch(() => undefined) : undefined;
    if (start) {
      const meta = metaFromPassage(start);
      await refIndex.setMeta(meta);
      const canonical = toHumanRef({ title: parseHumanRef(start.ref).title, sections: asked.sections, toSections: asked.toSections });
      const planned = planDisplay(canonical, meta);
      if (planned.kind === "sections") {
        plan = planned;
        canonicalRef = canonical;
        await refIndex.setAlias(requestedRef, canonical);
      }
    }
  }

  if (plan.kind === "resolve") {
    const passage = await qc.fetchQuery(textQueryOptions(ref, sel));
    await refIndex.setMeta(metaFromPassage(passage));
    // A super-section request comes back as its first section; a misspelt title comes back canonical.
    canonicalRef = passage.ref;
    await refIndex.setAlias(requestedRef, canonicalRef);
    const meta = metaFromPassage(passage);
    plan = planDisplay(canonicalRef, meta);
    const asked = parseHumanRef(canonicalRef);
    if (plan.kind === "resolve" && asked.title === meta.book && asked.sections.length === meta.textDepth) {
      // A segment range whose sections cannot be enumerated here (a commentary range across chapters: how many verses chapter 1 has is
      // the API's to say): show the sections the API names, and highlight the range by address (CODE_REVIEW low: it lost its highlight)
      plan = { kind: "sections", sectionRefs: passage.sectionRefs, highlight: { from: asked.sections, to: asked.toSections }, canonicalRef };
    } else if (plan.kind === "resolve") {
      // A ref above section level (a book, a commentary chapter) opens at its first available section,
      // like the old server (reader/views.py first_available_section_ref). Further sections load as
      // the reader scrolls. The API's own section list is the fallback for shapes we can't enumerate.
      const first = passage.firstAvailableSectionRef;
      const sectionRefs = first && first !== passage.ref ? [first] : passage.sectionRefs;
      canonicalRef = first ?? canonicalRef;
      await refIndex.setAlias(requestedRef, canonicalRef);
      plan = { kind: "sections", sectionRefs, highlight: null, canonicalRef };
    }
    // If what we fetched *is* a whole display section, seed it so it isn't fetched twice.
    if (plan.sectionRefs.length === 1 && plan.sectionRefs[0] === passage.ref) {
      qc.setQueryData(textQueryKey(passage.ref, sel), passage);
    }
  }

  // A long range (Psalms 1-150, Shabbat 2a-157b: hundreds of sections) loads only its first sections; the column loads the rest as
  // the reader scrolls, and the range's highlight is by address, so it carries on (CODE_REVIEW R-05).
  const sections = await Promise.all(plan.sectionRefs.slice(0, MAX_INITIAL_SECTIONS).map((r) => qc.ensureQueryData(textQueryOptions(r, sel))));
  for (const s of sections) await refIndex.setMeta(metaFromPassage(s));
  return { canonicalRef, sections, highlight: plan.highlight };
}

/** The most sections a page loads up front for one panel (a range's first sections). */
export const MAX_INITIAL_SECTIONS = 4;

/** Warm the cache for neighbouring sections so paging is instant. */
export function prefetchNeighbours(qc: QueryClient, passage: TextPassage, sel: VersionSelection = {}): void {
  for (const r of [passage.next, passage.prev]) if (r) void qc.prefetchQuery(textQueryOptions(r, sel));
}

/**
 * Fetch a section in the versions wanted when it arrives, not when it was asked for: while it loads the reader may change version,
 * and the column swaps only the sections it already holds, so a late section in the old versions stayed in the old edition
 * (review F04). `wanted()` is read again after each answer; the answer that matches what is wanted now is returned.
 */
export async function fetchInWantedVersions(
  fetchIn: (sel: VersionSelection) => Promise<TextPassage>,
  wanted: () => VersionSelection,
): Promise<TextPassage> {
  let asked = wanted();
  let passage = await fetchIn(asked);
  for (let i = 0; i < 5 && selectionKey(asked) !== selectionKey(wanted()); i++) {
    asked = wanted();
    passage = await fetchIn(asked);
  }
  return passage;
}
