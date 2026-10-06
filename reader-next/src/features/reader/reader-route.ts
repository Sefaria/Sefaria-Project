import { readBannerDismissed } from "~/lib/reader/banner-source";
import { notFound, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { SefariaApiError } from "~/lib/api/client";
import { getRefIndex } from "~/lib/cache/ref-index-singleton";
import { urlToRef } from "~/lib/ref/url";
import type { ReaderSearch } from "~/lib/reader/url-state";
import { indexMetaQueryOptions } from "~/lib/text/commentary";
import { loadReaderPassage, passageUrl, type VersionSelection } from "~/lib/text/queries";
import { hasVersionPrefs, resolveTranslation, toApiVersion, type VersionPrefs } from "~/lib/versions/preferences";
import { readVersionPrefs } from "~/lib/versions/prefs-source";
import { panelOrder, updatePanel } from "~/lib/workspace/ops";
import type { PanelId, TextPanelState, Workspace } from "~/lib/workspace/types";
import { decodeWorkspace, encodeWorkspace, type RawSearch } from "~/lib/workspace/url";

/** What one text panel needs to render, from the library cache the loader filled. */
export interface ReaderRouteData {
  /** Canonical ref the panel shows. */
  ref: string;
  sectionRefs: string[];
  highlight: { from: string[]; to: string[] } | null;
  /** Neighbouring sections, for `<link rel=prev|next>` (crawlers follow these; readers use scroll). */
  prev: string | null;
  next: string | null;
  /** API URLs of the neighbouring sections, preloaded by the page head so scrolling past an edge is instant. */
  preload: string[];
  /** The versions this data was loaded in (the URL can already name others while the next load runs). */
  versions: VersionSelection;
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

async function loadTextPanel(queryClient: QueryClient, panel: TextPanelState, prefs: VersionPrefs, bannerDismissed: boolean): Promise<ReaderRouteData> {
  const load = async (sel: VersionSelection) => {
    try {
      return await loadReaderPassage(queryClient, getRefIndex(), panel.ref, sel);
    } catch (e) {
      if (e instanceof SefariaApiError && e.status !== undefined && e.status >= 400 && e.status < 500) throw notFound();
      throw e;
    }
  };
  let versions = panel.versions;
  let result = await load(versions);

  // No translation named in the URL (or one this text lacks): the reader's preferences decide (VER-014). Only
  // worth any work when preferences exist; and only a second load when the choice differs from the default.
  if (hasVersionPrefs(prefs)) {
    const first = result.sections[0]!;
    let corpus: string | undefined;
    if (Object.keys(prefs.byCorpus).length) {
      corpus = await queryClient.fetchQuery(indexMetaQueryOptions(first.indexTitle)).then((m) => m.corpora?.[0], () => undefined);
    }
    const resolved = resolveTranslation({ explicit: versions.translation, corpus, prefs, available: first.availableVersions });
    const showing = first.translationVersion ? toApiVersion(first.translationVersion) : undefined;
    if (resolved && resolved !== versions.translation && resolved !== showing) {
      versions = { ...versions, translation: resolved };
      result = await load(versions);
    }
  }
  const corpus = await queryClient.fetchQuery(indexMetaQueryOptions(result.sections[0]!.indexTitle)).then((m) => m.corpora?.[0], () => undefined);
  const prev = result.sections[0]!.prev;
  const next = result.sections.at(-1)!.next;
  return {
    ref: result.canonicalRef,
    sectionRefs: result.sections.map((s) => s.ref),
    highlight: result.highlight,
    prev,
    next,
    preload: [next, prev].filter((r): r is string => !!r).map((r) => passageUrl(r, versions)),
    versions,
    corpus,
    bannerDismissed,
  };
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
  const loaded = await Promise.all(ids.map((id) => loadTextPanel(args.queryClient, ws.panels[id] as TextPanelState, prefs, dismissed)));
  const panels = Object.fromEntries(ids.map((id, i) => [id, loaded[i]!])) as Record<PanelId, ReaderRouteData>;
  for (const id of ids) ws = updatePanel(ws, id, { ref: panels[id]!.ref });

  const full = decodeWorkspace(urlToRef(args.splat), (args.fullSearch ?? args.search) as RawSearch);
  let canonicalFull = full;
  for (const id of ids) canonicalFull = updatePanel(canonicalFull, id, { ref: panels[id]!.ref });
  const canonical = encodeWorkspace(canonicalFull)!;
  const requested = encodeWorkspace(full)!;
  const pathDiffers = canonical.path.slice(1) !== args.splat.replace(/^\/+|\/+$/g, "");
  const panelsDiffer = ids.slice(1).some((_, i) => canonical.search[`p${i + 2}`] !== requested.search[`p${i + 2}`]);
  if (pathDiffers || panelsDiffer) {
    throw redirect({
      to: "/$",
      params: { _splat: canonical.path.slice(1) },
      // Everything the reader understands is in the workspace, so its encoding is the whole canonical query.
      search: canonical.search as never,
      statusCode: 301,
    });
  }
  return { workspace: ws, panels };
}
