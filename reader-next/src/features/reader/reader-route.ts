import { readBannerDismissed } from "~/lib/reader/banner-source";
import { notFound, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { SefariaApiError } from "~/lib/api/client";
import { getRefIndex } from "~/lib/cache/ref-index-singleton";
import { isSplatOf, parseHumanRef, refToUrl, urlToRef } from "~/lib/ref/url";
import type { ReaderSearch } from "~/lib/reader/url-state";
import { indexMetaQueryOptions } from "~/lib/text/commentary";
import { loadReaderPassage, passageUrl, selectionKey, type VersionSelection } from "~/lib/text/queries";
import { hasVersionPrefs, normalizeRequestedVersion, resolveTranslation, toApiVersion, type VersionPrefs } from "~/lib/versions/preferences";
import { readVersionPrefs } from "~/lib/versions/prefs-source";
import { hebrewRefOf } from "~/lib/reader/page-title";
import { panelOrder, updatePanel } from "~/lib/workspace/ops";
import type { PanelId, TextPanelState, Workspace } from "~/lib/workspace/types";
import { decodeWorkspace, versionApiToParam, type RawSearch } from "~/lib/workspace/url";
import { decodeVtitle } from "~/lib/reader/url-state";
import type { VersionMeta } from "~/lib/text/model";

/** What one text panel needs to render, from the library cache the loader filled. */
export interface ReaderRouteData {
  /** Canonical ref the panel shows. */
  ref: string;
  /** The same in Hebrew, when it can be named from the loaded sections (the page title in the Hebrew interface). */
  heRef?: string;
  sectionRefs: string[];
  highlight: { from: string[]; to: string[] } | null;
  /** Neighbouring sections, for `<link rel=prev|next>` (crawlers follow these; readers use scroll). */
  prev: string | null;
  next: string | null;
  /** API URLs of the neighbouring sections, preloaded by the page head so scrolling past an edge is instant. */
  preload: string[];
  /** The versions this data was loaded in (the URL can already name others while the next load runs). */
  versions: VersionSelection;
  /** The versions the URL named when this data was loaded (before the reader's preferences filled the rest in). */
  requested: VersionSelection;
  /** The text's corpus ("Tanakh", "Bavli"…), for the translations banner. */
  corpus?: string;
  /** The translations banner was dismissed in this session. */
  bannerDismissed?: boolean;
}

export interface WorkspaceRouteData {
  /** The workspace in the URL, with canonical refs. */
  workspace: Workspace;
  panels: Record<PanelId, ReaderRouteData>;
}

/** The `ven`/`vhe` values a panel's address carries, as spelled there (`family|Title_With_Underscores`). */
interface AddressVersions {
  ven?: string;
  vhe?: string;
}

/** A panel whose address names versions this text does not have: each value to write instead (null: drop the parameter). */
interface VersionRewrite {
  rewrite: Partial<Record<keyof AddressVersions, string | null>>;
}

/** An address value → its language (none in an old link naming only the title) and its title, decoded as the address spells it. */
function parseVersionParam(raw: string): { family?: string; title: string } {
  const i = raw.indexOf("|");
  return i < 0 ? { title: decodeVtitle(raw) } : { family: raw.slice(0, i), title: decodeVtitle(raw.slice(i + 1)) };
}

/** One address value however it reached us: the parsed query has already turned the escapes `encodeVtitle` writes back into characters. */
const unescapeParam = (v: string) => v.replace(/%3B|%26|%23|%2B/gi, (c) => decodeURIComponent(c));
const sameParam = (a: string, b: string) => unescapeParam(a) === unescapeParam(b);

/**
 * What the address's `ven`/`vhe` should say for this text, compared in address form as sefaria.org does: a value that already names
 * the version it resolves to is left alone, so a title that does not survive the trip through the address (`_`, a non-breaking space)
 * never redirects to itself. `resolved` is the versions to load for an address that stays (such a title, by its real spelling).
 */
function versionRewrite(address: AddressVersions, available: readonly VersionMeta[]): { rewrite: VersionRewrite["rewrite"] | null; resolved: VersionSelection } {
  const out: VersionRewrite["rewrite"] = {};
  const resolved: VersionSelection = {};
  for (const [key, side] of [["ven", "translation"], ["vhe", "primary"]] as const) {
    const raw = address[key];
    if (raw === undefined) continue;
    const api = normalizeRequestedVersion(parseVersionParam(raw), side, available);
    const target = versionApiToParam(api) ?? null;
    if (target === null || !sameParam(target, raw)) out[key] = target;
    else resolved[side] = api;
  }
  return { rewrite: Object.keys(out).length ? out : null, resolved };
}

async function loadTextPanel(
  queryClient: QueryClient,
  panel: TextPanelState,
  prefs: VersionPrefs,
  bannerDismissed: boolean,
  /** The versions the address names, to rewrite when this text lacks them; null to load as is. */
  address: AddressVersions | null,
): Promise<ReaderRouteData | VersionRewrite> {
  const load = async (sel: VersionSelection) => {
    try {
      return await loadReaderPassage(queryClient, getRefIndex(), panel.ref, sel);
    } catch (e) {
      // a client error is "no such text" (404); a refusal for now (429), a timeout (408) or a server error is the API's trouble, answered
      // 503 by the request middleware — as a 404 the page went to Django, which served the old reader for a text that exists
      if (e instanceof SefariaApiError && e.status !== undefined && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) throw notFound();
      throw e;
    }
  };
  let versions = panel.versions;
  let result = await load(versions);

  // A `ven`/`vhe` naming a version this text lacks (a translation carried over from another book), or spelled as an old link spells it,
  // is rewritten in the address to the version sefaria.org would show, or dropped so the preferences and the default decide.
  if (address) {
    const { rewrite, resolved } = versionRewrite(address, result.sections[0]!.availableVersions);
    if (rewrite) return { rewrite };
    const named = { primary: resolved.primary ?? versions.primary, translation: resolved.translation ?? versions.translation };
    if (selectionKey(named) !== selectionKey(versions)) {
      versions = named;
      result = await load(versions);
    }
  }

  // No translation named in the URL (or one this text lacks): the reader's preferences decide (VER-014). Only
  // worth any work when preferences exist; and only a second load when the choice differs from the default.
  if (hasVersionPrefs(prefs)) {
    const first = result.sections[0]!;
    let corpus: string | undefined;
    if (Object.keys(prefs.byCorpus).length) {
      corpus = await queryClient.ensureQueryData({ ...indexMetaQueryOptions(first.indexTitle), revalidateIfStale: true }).then((m) => m.corpora?.[0], () => undefined);
    }
    const resolved = resolveTranslation({ explicit: versions.translation, corpus, prefs, available: first.availableVersions });
    const showing = first.translationVersion ? toApiVersion(first.translationVersion) : undefined;
    if (resolved && resolved !== versions.translation && resolved !== showing) {
      versions = { ...versions, translation: resolved };
      result = await load(versions);
    }
  }
  const corpus = await queryClient.ensureQueryData({ ...indexMetaQueryOptions(result.sections[0]!.indexTitle), revalidateIfStale: true }).then((m) => m.corpora?.[0], () => undefined);
  const prev = result.sections[0]!.prev;
  const next = result.sections.at(-1)!.next;
  return {
    ref: result.canonicalRef,
    heRef: hebrewRefOf(result.canonicalRef, result.sections),
    sectionRefs: result.sections.map((s) => s.ref),
    highlight: result.highlight,
    prev,
    next,
    preload: [next, prev].filter((r): r is string => !!r).map((r) => passageUrl(r, versions)),
    versions,
    requested: panel.versions,
    corpus,
    bannerDismissed,
  };
}

/**
 * Whether the canonical ref is only another spelling of the ref asked for (a title's alias or case, `_` and `:` for `.`): the same
 * sections. Anything else sends the reader to another place.
 */
export function isRespelling(asked: string, canonical: string): boolean {
  const a = parseHumanRef(asked);
  const c = parseHumanRef(canonical);
  return a.sections.join(":") === c.sections.join(":") && a.toSections.join(":") === c.toSections.join(":");
}

/** Whether two queries name the same versions, in address form. */
function sameVersionParams(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => /^v(en|he)\d*$/.test(k)));
  return [...keys].every((k) => (a[k] === undefined) === (b[k] === undefined) && (a[k] === undefined || sameParam(String(a[k]), String(b[k]))));
}

/**
 * The query to redirect to after each panel's version rewrite (panel n>1 under the suffix of its p<n>), every other parameter kept in
 * place; null when it would name the same versions as the address asked for, so the loader can never redirect to itself.
 */
export function versionRedirectTarget(
  query: Record<string, unknown>,
  panels: readonly { suffix: string; rewrite: Partial<Record<"ven" | "vhe", string | null>> | null }[],
): Record<string, unknown> | null {
  const target = { ...query };
  for (const { suffix, rewrite } of panels) {
    for (const [key, value] of Object.entries(rewrite ?? {})) {
      if (value === null || value === undefined) delete target[`${key}${suffix}`];
      else target[`${key}${suffix}`] = value;
    }
  }
  return sameVersionParams(target, query) ? null : target;
}

/**
 * Route loader for a text URL: every panel in it (lib/workspace/url.ts). Fills the library cache (so the page
 * renders from cache, on the server and again on the client without a refetch), and redirects (301) to the
 * canonical URL when any panel's ref is spelled differently.
 *
 * @feature TXD-003 @feature SHL-030 Initial panel construction from server props
 */
export async function loadWorkspaceRoute(args: {
  /** Reader preferences (tests pass them; otherwise read from the cookies). */
  prefs?: VersionPrefs;
  queryClient: QueryClient;
  splat: string;
  /** What decides the texts (refs and versions): the loader's dependencies. */
  search: ReaderSearch;
  /** The whole query, so a redirect keeps display state (lang, with…) too. */
  fullSearch?: ReaderSearch;
}): Promise<WorkspaceRouteData> {
  let ws = decodeWorkspace(urlToRef(args.splat), args.search as RawSearch);
  const ids = panelOrder(ws);
  const prefs = args.prefs ?? (await readVersionPrefs());
  const dismissed = await readBannerDismissed();
  const query = { ...((args.fullSearch ?? args.search) as Record<string, unknown>) };
  const extra = Object.keys(query)
    .map((k) => /^p(\d+)$/.exec(k))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) >= 2 && String(query[m[0]] ?? "") !== "")
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  // Panel n>1 reads ven<n>/vhe<n> with the n of its p<n>
  const suffixOf = (i: number) => (i === 0 ? "" : String(extra[i - 1]));
  const param = (key: string) => {
    const v = query[key];
    return (typeof v === "string" || typeof v === "number") && String(v) !== "" ? String(v) : undefined;
  };
  const addressOf = (i: number): AddressVersions => ({ ven: param(`ven${suffixOf(i)}`), vhe: param(`vhe${suffixOf(i)}`) });
  const loadAll = (rewrite: boolean) => Promise.all(ids.map((id, i) => loadTextPanel(args.queryClient, ws.panels[id] as TextPanelState, prefs, dismissed, rewrite ? addressOf(i) : null)));
  let loaded = await loadAll(true);

  // Versions this text lacks: redirect (302, as sefaria.org) to the address naming what will be shown, before anything renders.
  if (loaded.some((l) => "rewrite" in l)) {
    const target = versionRedirectTarget(query, loaded.map((l, i) => ({ suffix: suffixOf(i), rewrite: "rewrite" in l ? l.rewrite : null })));
    if (target) throw redirect({ to: `/${args.splat}` as never, search: target as never, statusCode: 302, replace: true });
    // the rewrite names what the address already says: load the versions as asked
    loaded = await loadAll(false);
  }
  const panels = Object.fromEntries(ids.map((id, i) => [id, loaded[i] as ReaderRouteData])) as Record<PanelId, ReaderRouteData>;
  for (const id of ids) ws = updatePanel(ws, id, { ref: panels[id]!.ref });

  // A ref that is not in canonical form redirects to the canonical ref with the request's own query. Only the refs change: the path
  // and any p<n> (the old numbering). A respelling of the same ref is permanent (301), as sefaria.org answers it (VERIFIED:
  // /Gen.1.1?lang=en → /Genesis.1.1?lang=en). Being sent to another section (a commentary chapter to its first comment, a ref above
  // section level or with no text to a section that has one) is temporary (302): sefaria.org answers those 200 at the address asked
  // for, and a 301 would be kept by browsers for good although the texts can change.
  let panelsDiffer = false;
  let moved = false;
  extra.forEach((n, i) => {
    const id = ids[i + 1];
    if (!id) return;
    const canon = refToUrl(panels[id]!.ref);
    const asked = urlToRef(String(query[`p${n}`]));
    if (asked !== panels[id]!.ref) {
      panelsDiffer = true;
      moved ||= !isRespelling(asked, panels[id]!.ref);
      query[`p${n}`] = canon;
    }
  });
  const canonicalPath = refToUrl(panels[ids[0]!]!.ref);
  const pathDiffers = !isSplatOf(args.splat, canonicalPath);
  if (pathDiffers) moved ||= !isRespelling(urlToRef(args.splat), panels[ids[0]!]!.ref);
  if (pathDiffers || panelsDiffer) {
    throw redirect({ to: `/${canonicalPath}` as never, search: query as never, statusCode: moved ? 302 : 301 });
  }
  return { workspace: ws, panels };
}

/**
 * The versions a panel shows. While the URL still names exactly what the loader was given, the loader's resolution wins: it filled in
 * what the URL left open from the reader's preferences (a URL naming only the source, `vhe`, keeps the saved translation;
 * it used to be dropped after hydration). When the URL names something newer, that is the reader's new choice.
 */
export function shownVersions(urlVersions: VersionSelection, data: Pick<ReaderRouteData, "versions" | "requested">): VersionSelection {
  if (selectionKey(urlVersions) === selectionKey(data.requested)) return data.versions;
  return urlVersions.translation || urlVersions.primary ? urlVersions : data.versions;
}
