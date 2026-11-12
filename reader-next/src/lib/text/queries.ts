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
import { apiJson, getSefariaClient, SEFARIA_API_ORIGIN, SefariaApiError, unwrap } from "~/lib/api/client";
import { PUBLIC_CONFIG } from "~/lib/config";
import { withPolicy } from "~/lib/cache/query-options";
import { RefIndex } from "~/lib/cache/ref-index";
import { getRefIndex } from "~/lib/cache/ref-index-singleton";
import { formatSections, parseHumanRef, isRangedRef, toHumanRef } from "~/lib/ref/url";
import { normaliseTexts, type RawTextsResponse, type TextPassage } from "./model";
import { isHighlighted, planDisplay, type BookMeta, type DisplayPlan, type Highlight } from "./plan";

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
  const passage = normaliseTexts(unwrap(result, `Text ${ref}`) as unknown as RawTextsResponse);
  // Every text answer is the server's word on its book's shape: remember it wherever the text was asked for (the sidebar's
  // commentaries too), so opening a ref in that book later plans its section without asking again.
  void getRefIndex().setMeta(metaFromPassage(passage));
  return passage;
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

/**
 * Where a ref above section level that names no section (a complex text's node: "Arukh HaShulchan, Orach Chaim") opens: its first
 * available section, from the small `/api/ref` answer (Django's RefView: `navigation_refs.first_available_section_ref`), as legacy's
 * server does (reader/views.py first_available_section_ref). Asking the texts API for the node itself downloads the whole node
 * (5.9 MB in 13.5 s for Orach Chaim: past the server's deadline, a 503). Null when the API knows no such ref.
 */
export async function fetchFirstSection(ref: string, signal?: AbortSignal): Promise<string | null> {
  const r = await globalThis.fetch(`${SEFARIA_API_ORIGIN}/api/ref/${encodeURIComponent(ref)}`, { signal });
  if (r.status >= 500) throw new SefariaApiError(`Ref ${ref}: HTTP ${r.status}`, r.status);
  if (!r.ok) return null;
  const data = await apiJson<{ is_ref?: boolean; navigation_refs?: { first_available_section_ref?: string | null } }>(r, `Ref ${ref}`).catch(() => null);
  return (data?.is_ref && data.navigation_refs?.first_available_section_ref) || null;
}

export const firstSectionQueryOptions = (ref: string) =>
  queryOptions<string | null>({ ...withPolicy("text", { queryKey: ["first-section", ref] as const, queryFn: ({ signal }: { signal: AbortSignal }) => fetchFirstSection(ref, signal) }) });

export interface ReaderPassage {
  /** The ref the reader should show in the URL (canonical spelling). */
  canonicalRef: string;
  sections: TextPassage[];
  highlight: Highlight | null;
}

/**
 * Load everything the reader needs to display `ref`, using cache layers in order
 * (memory → IndexedDB → network) and learning book metadata/aliases along the way.
 *
 * An address the library knows but with no text at or in it (a verse a commentary skips, "Rashi on Genesis 1:3"; a segment past the
 * end of its section, "Genesis 1:35") opens the first section with text after it, as sefaria.org does (reader/views.py
 * first_available_section_ref): the reader is never sent away for an address that names a real place in a book.
 */
export async function loadReaderPassage(
  qc: QueryClient,
  refIndex: RefIndex,
  requestedRef: string,
  sel: VersionSelection = {},
): Promise<ReaderPassage> {
  try {
    return await loadAsAddressed(qc, refIndex, requestedRef, sel);
  } catch (e) {
    if (!isEmptySection(e)) throw e;
    const ref = (await refIndex.resolveAlias(requestedRef)) ?? requestedRef;
    const next = await sectionToOpenInstead(qc, ref);
    if (!next) throw e;
    const opened = await loadAsAddressed(qc, refIndex, next, sel);
    await refIndex.setAlias(requestedRef, opened.canonicalRef);
    return opened;
  }
}

/** Where the texts API (v1, `/api/texts/<ref>`) places an address: its section, whether that section has text, and its neighbours with text. */
interface SectionNeighbours {
  known: boolean;
  sectionRef?: string;
  hasText?: boolean;
  prev?: string | null;
  next?: string | null;
}

const anyText = (x: unknown): boolean => (Array.isArray(x) ? x.some(anyText) : !!x);

/**
 * `/api/texts/<ref>` (Django's texts view): it answers for an empty section too (the v3 API says "no text"), with `prev`/`next` that skip
 * the sections with no text (Ref.prev_section_ref/next_section_ref). A server failure throws (the API's trouble, 503); an address the
 * library does not know (a misspelt title, a chapter past the book's end) is `known: false`.
 */
async function fetchSectionNeighbours(ref: string, signal?: AbortSignal): Promise<SectionNeighbours> {
  const r = await globalThis.fetch(`${SEFARIA_API_ORIGIN}/api/texts/${encodeURIComponent(ref)}?commentary=0&pad=0`, { signal });
  if (r.status >= 500) throw new SefariaApiError(`Texts ${ref}: HTTP ${r.status}`, r.status);
  if (!r.ok) return { known: false };
  // an address it does not know is answered 200 with an `error`
  const d = await apiJson<{ sectionRef?: string; prev?: string | null; next?: string | null; text?: unknown; he?: unknown }>(r, `Texts ${ref}`).catch((e: unknown) => {
    if (e instanceof SefariaApiError && e.payload) return null;
    throw e;
  });
  if (!d?.sectionRef) return { known: false };
  return { known: true, sectionRef: d.sectionRef, hasText: anyText(d.text) || anyText(d.he), prev: d.prev, next: d.next };
}

const sectionNeighboursQueryOptions = (ref: string) =>
  queryOptions<SectionNeighbours>({ ...withPolicy("text", { queryKey: ["section-neighbours", ref] as const, queryFn: ({ signal }: { signal: AbortSignal }) => fetchSectionNeighbours(ref, signal) }) });

/**
 * Where to open an address that has no text, as sefaria.org does (reader/views.py first_available_section_ref): the next section
 * with text after it (/Rashi_on_Genesis.1.3 → 1:4, /Genesis.1.35 → Genesis 2). Past the book's last text, sefaria.org shows an endless
 * "Loading…" (/Genesis.50.27) or a server error (/Rashi_on_Genesis.50.26.1); the reader is shown the end of the book instead: the
 * address's own section when it has text (Genesis 50), else the last section with text before it (Rashi on Genesis 50:23). Null when
 * the library does not know the address (a real "no such text"). A server failure on the way is thrown, not taken for "no such text".
 */
async function sectionToOpenInstead(qc: QueryClient, ref: string): Promise<string | null> {
  const p = parseHumanRef(ref);
  if (!p.sections.length) return null;
  const start = toHumanRef({ title: p.title, sections: p.sections, toSections: p.sections });
  const at = await qc.ensureQueryData(sectionNeighboursQueryOptions(start));
  if (!at.known) return null;
  const target = at.next ?? (at.hasText ? at.sectionRef : at.prev) ?? null;
  return target && target !== ref && parseHumanRef(target).sections.length ? target : null;
}

async function loadAsAddressed(qc: QueryClient, refIndex: RefIndex, requestedRef: string, sel: VersionSelection): Promise<ReaderPassage> {
  const ref = (await refIndex.resolveAlias(requestedRef)) ?? requestedRef;
  let plan = planDisplay(ref, await refIndex.getMeta(parseHumanRef(ref).title));
  let canonicalRef = ref;

  // A range in a book not met yet: learn the book's shape from the range's first point (one verse), then plan its sections, rather
  // than download the whole range (Genesis 1:1-10:5: ten chapters) before the first-sections cap applies. Shapes the
  // planner cannot enumerate (a commentary range across chapters) still ask the API for the range below.
  if (plan.kind === "resolve" && isRangedRef(ref)) {
    const asked = parseHumanRef(ref);
    const startRef = toHumanRef({ title: asked.title, sections: asked.sections, toSections: asked.sections });
    const start = asked.sections.length ? await qc.ensureQueryData({ ...textQueryOptions(startRef, sel), revalidateIfStale: true }).catch(() => undefined) : undefined;
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

  // Planned from what the index knew, with no answer from the server for this ref itself.
  const offline = plan.kind === "sections";

  /** Ask the server what `ref` shows: it names the canonical ref and its sections, or says there is no such text (an error). */
  const askServer = async (): Promise<Extract<DisplayPlan, { kind: "sections" }>> => {
    // what is cached shows at once, a stale copy is asked for again behind it (a navigation never waits on the network for it)
    const passage = await qc.ensureQueryData({ ...textQueryOptions(ref, sel), revalidateIfStale: true });
    await refIndex.setMeta(metaFromPassage(passage));
    // A super-section request comes back as its first section; a misspelt title comes back canonical.
    canonicalRef = passage.ref;
    const sp = spannedPlan(passage);
    if (sp) {
      canonicalRef = sp.canonicalRef;
      await refIndex.setAlias(requestedRef, canonicalRef);
      return sp;
    }
    const meta = metaFromPassage(passage);
    let p = planDisplay(canonicalRef, meta);
    const asked = parseHumanRef(canonicalRef);
    if (p.kind === "resolve" && asked.title === meta.book && asked.sections.length === meta.textDepth) {
      // A segment range whose sections cannot be enumerated here (a commentary range across chapters: how many verses chapter 1 has is
      // the API's to say): show the sections the API names, and highlight the range by address (it lost its highlight)
      p = { kind: "sections", sectionRefs: passage.sectionRefs, highlight: { from: asked.sections, to: asked.toSections }, canonicalRef };
    } else if (p.kind === "resolve") {
      // A ref above section level (a book, a commentary chapter) opens at its first available section,
      // like the old server (reader/views.py first_available_section_ref). Further sections load as
      // the reader scrolls. The API's own section list is the fallback for shapes we can't enumerate.
      const first = passage.firstAvailableSectionRef;
      const sectionRefs = first && first !== passage.ref ? [first] : passage.sectionRefs;
      canonicalRef = first ?? canonicalRef;
      await refIndex.setAlias(requestedRef, canonicalRef);
      p = { kind: "sections", sectionRefs, highlight: null, canonicalRef };
    }
    // If what we fetched *is* a whole display section, seed it so it isn't fetched twice.
    if (p.sectionRefs.length === 1 && p.sectionRefs[0] === passage.ref) {
      qc.setQueryData(textQueryKey(passage.ref, sel), passage);
    }
    return p;
  };
  // A node address with no section (a complex text's part): open its first section without downloading the whole node
  if (plan.kind === "resolve" && !isRangedRef(ref) && !parseHumanRef(ref).sections.length) {
    const first = await qc.ensureQueryData(firstSectionQueryOptions(ref)).catch(() => null);
    if (first && parseHumanRef(first).sections.length) {
      const opened = await loadReaderPassage(qc, refIndex, first, sel);
      await refIndex.setAlias(requestedRef, opened.canonicalRef);
      return opened;
    }
  }
  if (plan.kind === "resolve") plan = await askServer();

  // A long range (Psalms 1-150, Shabbat 2a-157b: hundreds of sections) loads only its first sections; the column loads the rest as
  // the reader scrolls, and the range's highlight is by address, so it carries on.
  // A section with nothing in it (a verse a commentary does not comment on: Rashi on Genesis 1:3) is answered "no text" (404); a range
  // over it shows the sections that have text, as sefaria.org does. Only when none of them has text is the range "no such text".
  const load = async (p: Extract<DisplayPlan, { kind: "sections" }>) => {
    const settled = await Promise.allSettled(p.sectionRefs.slice(0, MAX_INITIAL_SECTIONS).map((r) => qc.ensureQueryData({ ...textQueryOptions(r, sel), revalidateIfStale: true })));
    const failed = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
    const fatal = failed.find((s) => !isEmptySection(s.reason));
    if (fatal) throw fatal.reason;
    const loaded = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
    if (!loaded.length) throw failed[0]!.reason;
    return loaded;
  };
  let sections = await load(plan);
  // The book's shape says which section a segment would be in, not that the segment exists (Genesis 1:35: chapter 1 has 31 verses,
  // and the server answers "We have no text"). When the first highlighted segment is not in what loaded, the server decides.
  const start = plan.highlight && { from: plan.highlight.from, to: plan.highlight.from };
  if (offline && start && !sections.some((s) => s.segments.some((seg) => isHighlighted(seg.address, start, s.addressTypes)))) {
    canonicalRef = ref;
    plan = await askServer();
    sections = await load(plan);
  }
  // planned offline as one section, the server answered with a span (a daf without its amud): show that range of sections
  const sp = sections.length === 1 ? spannedPlan(sections[0]!) : null;
  if (sp) {
    canonicalRef = sp.canonicalRef;
    await refIndex.setAlias(requestedRef, canonicalRef);
    plan = sp;
    sections = await load(plan);
  }
  for (const s of sections) await refIndex.setMeta(metaFromPassage(s));
  return { canonicalRef, sections, highlight: plan.highlight };
}

/**
 * A daf without its amud ("Berakhot 2") comes back spanning both amudim under the address as asked: it is that range of whole sections,
 * as on sefaria.org (/Berakhot.2 → Berakhot 2a-2b, all highlighted). Written from the server's own sections/toSections; null otherwise.
 */
function spannedPlan(passage: TextPassage): Extract<DisplayPlan, { kind: "sections" }> | null {
  if (!passage.isSpanning || isRangedRef(passage.ref) || !passage.sections.length || passage.sections.join(":") === passage.toSections.join(":")) return null;
  const meta = metaFromPassage(passage);
  const spanned = `${meta.book} ${formatSections(passage.sections, passage.toSections)}`;
  const p = planDisplay(spanned, meta);
  return p.kind === "sections" ? { ...p, canonicalRef: spanned } : null;
}

/** The API's answer for a section that exists in the book's shape but has no text in any version ("We have no text for …"). */
// An unknown title ("Could not find title…") or a chapter past the book's end ("Genesis ends at Chapter 50.") is also a 404, with
// another message: those are no such text, and no further request is made for them (sefaria.org makes none either).
const isEmptySection = (e: unknown): boolean => e instanceof SefariaApiError && e.status === 404 && /We have no text/.test(e.message);

/** The most sections a page loads up front for one panel (a range's first sections). */
export const MAX_INITIAL_SECTIONS = 4;

/** Warm the cache for neighbouring sections so paging is instant. */
export function prefetchNeighbours(qc: QueryClient, passage: TextPassage, sel: VersionSelection = {}): void {
  // only what is not in memory (prefetchQuery would refetch a stale neighbour at every section crossing; staff's every time)
  for (const r of [passage.next, passage.prev]) if (r && qc.getQueryData(textQueryOptions(r, sel).queryKey) === undefined) void qc.prefetchQuery(textQueryOptions(r, sel));
}

/**
 * Fetch a section in the versions wanted when it arrives, not when it was asked for: while it loads the reader may change version,
 * and the column swaps only the sections it already holds, so a late section in the old versions stayed in the old edition.
 * `wanted()` is read again after each answer; the answer that matches what is wanted now is returned.
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
