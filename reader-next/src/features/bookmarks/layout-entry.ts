import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { booksOnScreen } from "~/lib/bookmarks/layout";
import { isReaderPath } from "~/lib/reader/paths";
import { parseSearch } from "~/lib/reader/search-serializer";
import { parseHumanRef, urlToRef } from "~/lib/ref/url";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { entryKey } from "../workspace/navigation";

/**
 * Which history entries were reached by an in-app navigation (a link, a search result, the table of contents, a bookmark),
 * and which books were on screen just before. Arriving that way at a bookmarked book that wasn't already on screen opens
 * My layout; a typed or shared URL, a reload, and back/forward open exactly what the URL says.
 */
const pushed = new Map<string, string[]>();

function booksAt(location: { pathname: string; search: unknown }): string[] {
  if (!isReaderPath(location.pathname)) return [];
  const ref = urlToRef(decodeURIComponent(location.pathname.replace(/^\/+/, "")));
  // a bare title is the book's table of contents, not the book on screen
  if (!parseHumanRef(ref).sections.length) return [];
  const search = typeof location.search === "string" ? parseSearch(location.search) : (location.search as RawSearch);
  return booksOnScreen(decodeWorkspace(ref, search));
}

/** Mount once, at the root: records in-app navigations from the start. */
export function useLayoutEntryTracker() {
  const router = useRouter();
  useEffect(() => {
    let previous = router.history.location;
    return router.history.subscribe(({ location, action }) => {
      const key = entryKey(location.state);
      if (action.type === "PUSH" && key) pushed.set(key, booksAt(previous));
      previous = location;
    });
  }, [router]);
}

/** True once for an entry reached in-app at `book` from a page that didn't show it. */
export function takeLayoutEntry(key: string | undefined, book: string): boolean {
  if (!key || !pushed.has(key)) return false;
  const before = pushed.get(key)!;
  pushed.delete(key);
  return !before.includes(book);
}
