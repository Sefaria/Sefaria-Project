import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { getBookmarks, setBookmarkLayout, useBookmark, type Bookmark } from "~/lib/bookmarks";
import { bookmarkEntry, bookOf, layoutAutosave, layoutHasCompanions, placeCompanions, workspaceFromLayout } from "~/lib/bookmarks/layout";
import { linksQueryOptions } from "~/lib/connections/queries";
import { sectionOfSegment } from "~/lib/workspace/linked-verses";
import { panelAt, panelOrder } from "~/lib/workspace/ops";
import type { Workspace } from "~/lib/workspace/types";
import { useReaderSettings } from "../reader/settings-context";
import { entryKey, readNavState, urlDefaultsFor, useWorkspaceNav, workspaceHref } from "../workspace/navigation";

/**
 * Opens My layout around where panel 1 is now, each companion placed through the links of that verse. Undefined when the
 * book's bookmark has no layout beyond the main text.
 */
export function useOpenMyLayout(book: string): ((replace?: boolean) => Promise<void>) | undefined {
  const bookmark = useBookmark(book);
  const nav = useWorkspaceNav();
  const qc = useQueryClient();
  const router = useRouter();
  const saved = bookmark?.layout?.search;
  if (saved === undefined || !layoutHasCompanions(saved)) return undefined;
  return async (replace = false) => {
    const main = panelAt(nav.current(), 0)?.ref;
    if (!main) return;
    const target: Workspace = workspaceFromLayout(main, saved);
    const from = entryKey(router.state.location.state);
    const links = panelOrder(target).length > 1 ? await qc.fetchQuery(linksQueryOptions(sectionOfSegment(main))).catch(() => []) : [];
    if (entryKey(router.state.location.state) !== from) return; // the reader went elsewhere meanwhile
    nav.go(placeCompanions(target, links), { replace, bk: true, state: { nav: "go" } });
  };
}

/**
 * The address a bookmark link opens: `ref` (default: the bookmark's place) in the bookmark's saved layout. The layout is in the
 * link itself, so it opens the same way from a click, a new tab or a reload.
 */
export function useBookmarkHref(): (b: Bookmark, ref?: string, extra?: Record<string, string>) => string {
  const { settings } = useReaderSettings();
  const lang = urlDefaultsFor(settings).lang;
  const aliyot = urlDefaultsFor(settings).aliyot;
  return useCallback((b, ref = b.ref, extra) => workspaceHref(bookmarkEntry(b.layout?.search, ref, extra), { lang, aliyot }), [lang, aliyot]);
}

/** The bookmark of `ref`'s book, if any. */
export const bookmarkOfRef = (ref: string): Bookmark | undefined => getBookmarks().books[bookOf(ref)];

/**
 * The workspace panel 1 last showed, kept outside the component: panel 1 remounts when the arrangement around it changes
 * shape. It is forgotten once no reader is on screen, so coming back counts as arriving.
 */
let lastSeen: Workspace | undefined;
let mounted = 0;

/** Keeps the bookmark of panel 1's book in step with the arrangement on screen (see `layoutAutosave`). Mount once, in panel 1. */
export function useLayoutAutosave(book: string, enabled: boolean) {
  const nav = useWorkspaceNav();
  const { settings } = useReaderSettings();
  const location = useLocation();
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    mounted++;
    return () => {
      mounted--;
      setTimeout(() => {
        if (!mounted) lastSeen = undefined;
      });
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const ws = nav.current();
    const before = lastSeen;
    lastSeen = ws;
    const b = getBookmarks().books[book];
    const main = panelAt(ws, 0)?.ref;
    if (!b || !main || bookOf(main) !== bookOf(b.ref)) return;
    // Arriving in My layout (a bookmark link, a reload): companions saved elsewhere move to the main text's verse.
    if (!before && ws.bk && panelOrder(ws).length > 1) {
      const from = entryKey(router.state.location.state);
      void qc.fetchQuery(linksQueryOptions(sectionOfSegment(main))).then((links) => {
        if (entryKey(router.state.location.state) !== from) return;
        const placed = placeCompanions(nav.current(), links);
        if (nav.href(placed) !== nav.href(nav.current())) nav.go(placed, { replace: true, state: { nav: "go" } });
      }, () => undefined);
    }
    const change = layoutAutosave(before, ws, b.layout?.search, urlDefaultsFor(settings));
    if (!change) return;
    setBookmarkLayout(book, { search: change.save });
    if (change.adopt) {
      const { nav: kind, panel, ref, terms } = readNavState(location.state);
      nav.go(ws, { replace: true, bk: true, state: { nav: kind ?? "stay", panel, ref, terms } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.href, enabled, book]);
}
