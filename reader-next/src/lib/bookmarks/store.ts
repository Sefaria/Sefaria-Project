import { useSyncExternalStore } from "react";
import * as model from "./model";
import { EMPTY_STATE, type Bookmark, type BookmarkLayout, type BookmarkMode, type BookmarkState } from "./model";

/**
 * The reader's bookmarks, kept in this browser. Every change is written through to localStorage and announced to
 * subscribers; other tabs pick changes up from the `storage` event. Nothing leaves the device.
 */
const KEY = "sefaria-reader:bookmarks";

let state: BookmarkState | undefined;
const listeners = new Set<() => void>();

const load = (): BookmarkState => {
  try {
    return model.parseState(localStorage.getItem(KEY));
  } catch {
    return EMPTY_STATE;
  }
};

const current = (): BookmarkState => (state ??= typeof window === "undefined" ? EMPTY_STATE : load());

const commit = (next: BookmarkState) => {
  if (next === current()) return;
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private window or storage off: bookmarks last for this visit only */
  }
  listeners.forEach((l) => l());
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = load();
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};

export const getBookmarks = (): BookmarkState => current();
export const addBookmark = (book: string, ref: string, layout?: BookmarkLayout) => commit(model.addBookmark(current(), book, ref, Date.now(), layout));
export const setBookmarkLayout = (book: string, layout: BookmarkLayout) => commit(model.setLayout(current(), book, layout, Date.now()));
export const moveBookmark = (book: string, ref: string) => commit(model.moveBookmark(current(), book, ref, Date.now()));
export const removeBookmark = (book: string) => commit(model.removeBookmark(current(), book));
export const setBookmarkMode = (book: string, mode: BookmarkMode) => commit(model.setBookmarkMode(current(), book, mode, Date.now()));
export const setDefaultBookmarkMode = (mode: BookmarkMode) => commit(model.setDefaultMode(current(), mode));
export const resetFurthest = (book: string) => commit(model.resetFurthest(current(), book));
/** Call on every segment the reader settles on: moves auto bookmarks and advances their furthest point. */
export const noteReading = (book: string, ref: string) => commit(model.noteReading(current(), book, ref, Date.now()));

const useBookmarkState = () => useSyncExternalStore(subscribe, current, () => EMPTY_STATE);

/** All bookmarks plus the default mode for new ones. */
export const useBookmarks = (): BookmarkState => useBookmarkState();
export const useBookmark = (book: string): Bookmark | undefined => useBookmarkState().books[book];
/** False during the server render and hydration, when stored bookmarks can't be read yet. */
export const useBookmarksLoaded = (): boolean => useSyncExternalStore(noSubscribe, () => true, () => false);
const noSubscribe = () => () => {};

/** Test hook: forget the in-memory copy so the next read comes from storage again. */
export const resetBookmarkStoreForTests = () => {
  state = undefined;
};
