import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { booksOnScreen } from "~/lib/bookmarks/layout";
import { isReaderPath } from "~/lib/reader/paths";
import { parseSearch } from "~/lib/reader/search-serializer";
import { parseHumanRef, urlToRef } from "~/lib/ref/url";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { entryKey } from "../workspace/navigation";

/**
 * My layout opens by itself only when the reader comes back to a book on purpose: through its bookmark (the bookmarks page,
 * the bookshelf) or a search result. Those links call `requestLayoutEntry` just before navigating. Any other way in (the
 * table of contents, a citation, a typed or shared URL, a reload, back/forward) opens exactly what the URL says: the reader
 * is probably looking something up.
 */
const REQUEST_TTL_MS = 10_000;
let requested: { book: string; at: number } | null = null;

/** The next in-app arrival at `book` (title as in its refs) opens My layout. */
export function requestLayoutEntry(book: string) {
  requested = { book, at: Date.now() };
}

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

/** True once for an entry reached in-app at `book`, asked for by a bookmark or search link, from a page that didn't show it. */
export function takeLayoutEntry(key: string | undefined, book: string): boolean {
  if (!key || !pushed.has(key)) return false;
  const before = pushed.get(key)!;
  pushed.delete(key);
  const asked = requested !== null && requested.book === book && Date.now() - requested.at < REQUEST_TTL_MS;
  if (asked) requested = null;
  return asked && !before.includes(book);
}
