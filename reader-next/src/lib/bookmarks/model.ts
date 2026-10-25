import { parseHumanRef } from "../ref/url";

/**
 * Per-book bookmarks: one per book (keyed by index title), each pointing at a segment ref. A manual bookmark moves only
 * when the reader moves it; an auto bookmark follows the reader's current segment and also keeps the furthest segment
 * reached, so jumping back to look something up doesn't lose your place.
 */
export type BookmarkMode = "manual" | "auto";

export interface Bookmark {
  book: string;
  ref: string;
  mode: BookmarkMode;
  /** Epoch ms of the last change to `ref` or `mode`. */
  updated: number;
  /** Auto mode: the furthest segment reached since the bookmark was added or the furthest point was reset. */
  furthest?: string;
  /** The workspace around the book, as the URL query that restores it. Carried through moves and mode changes. */
  layout?: BookmarkLayout;
}

export interface BookmarkLayout {
  search: Record<string, string>;
}

/** Version of the stored shape; bump it with a migration in `parseState` when a change can't be read as-is. */
export const STATE_VERSION = 1;

export interface BookmarkState {
  version: typeof STATE_VERSION;
  defaultMode: BookmarkMode;
  books: Record<string, Bookmark>;
}

export const EMPTY_STATE: BookmarkState = { version: STATE_VERSION, defaultMode: "auto", books: {} };

/** "2b" → 5, "7" → 7: daf sides sort after their daf, numbers as numbers. */
const addressRank = (a: string): number | undefined => {
  const m = /^(\d+)([a-d]?)$/.exec(a);
  if (!m) return undefined;
  return m[2] ? Number(m[1]) * 4 + (m[2].charCodeAt(0) - 97) : Number(m[1]);
};

/**
 * Orders two refs of the same book by position: negative when `a` comes first. Undefined when they can't be compared
 * from the ref alone (different nodes of a complex text, or no section numbers).
 */
export function compareRefs(a: string, b: string): number | undefined {
  const pa = parseHumanRef(a);
  const pb = parseHumanRef(b);
  if (pa.title !== pb.title || !pa.sections.length || !pb.sections.length) return undefined;
  const n = Math.min(pa.sections.length, pb.sections.length);
  for (let i = 0; i < n; i++) {
    const ra = addressRank(pa.sections[i]!);
    const rb = addressRank(pb.sections[i]!);
    if (ra === undefined || rb === undefined) return undefined;
    if (ra !== rb) return ra - rb;
  }
  return pa.sections.length - pb.sections.length;
}

/** The later of two refs; an incomparable pair takes the newer one, so the furthest point never gets stuck. */
const later = (current: string | undefined, next: string): string => {
  if (!current) return next;
  const c = compareRefs(current, next);
  return c === undefined || c < 0 ? next : current;
};

const put = (state: BookmarkState, b: Bookmark): BookmarkState => ({ ...state, books: { ...state.books, [b.book]: b } });

export function addBookmark(state: BookmarkState, book: string, ref: string, now: number): BookmarkState {
  const existing = state.books[book];
  const mode = existing?.mode ?? state.defaultMode;
  return put(state, { book, ref, mode, updated: now, ...(mode === "auto" ? { furthest: ref } : {}), ...(existing?.layout ? { layout: existing.layout } : {}) });
}

export function moveBookmark(state: BookmarkState, book: string, ref: string, now: number): BookmarkState {
  const b = state.books[book];
  if (!b) return addBookmark(state, book, ref, now);
  if (b.ref === ref) return state;
  return put(state, { ...b, ref, updated: now, ...(b.mode === "auto" ? { furthest: later(b.furthest, ref) } : {}) });
}

export function removeBookmark(state: BookmarkState, book: string): BookmarkState {
  if (!state.books[book]) return state;
  const { [book]: _gone, ...books } = state.books;
  return { ...state, books };
}

export function setBookmarkMode(state: BookmarkState, book: string, mode: BookmarkMode, now: number): BookmarkState {
  const b = state.books[book];
  if (!b || b.mode === mode) return state;
  const { furthest: _f, ...rest } = b;
  return put(state, mode === "auto" ? { ...rest, mode, updated: now, furthest: later(b.furthest, b.ref) } : { ...rest, mode, updated: now });
}

export function setDefaultMode(state: BookmarkState, mode: BookmarkMode): BookmarkState {
  return state.defaultMode === mode ? state : { ...state, defaultMode: mode };
}

/** The furthest point of an auto bookmark goes back to where the bookmark is now. */
export function resetFurthest(state: BookmarkState, book: string): BookmarkState {
  const b = state.books[book];
  if (!b || b.mode !== "auto" || b.furthest === b.ref) return state;
  return put(state, { ...b, furthest: b.ref });
}

/** The reader settled on `ref`: an auto bookmark follows it and its furthest point advances. Manual bookmarks stay put. */
export function noteReading(state: BookmarkState, book: string, ref: string, now: number): BookmarkState {
  const b = state.books[book];
  if (!b || b.mode !== "auto") return state;
  const furthest = later(b.furthest, ref);
  if (b.ref === ref && b.furthest === furthest) return state;
  return put(state, { ...b, ref, furthest, updated: b.ref === ref ? b.updated : now });
}

const isLayout = (v: unknown): v is BookmarkLayout => {
  const search = (v as { search?: unknown } | null | undefined)?.search;
  return !!search && typeof search === "object" && Object.values(search).every((x) => typeof x === "string");
};

/** Reads stored JSON defensively: anything malformed is dropped rather than breaking the reader. */
export function parseState(raw: string | null): BookmarkState {
  if (!raw) return EMPTY_STATE;
  try {
    const v = JSON.parse(raw) as Partial<BookmarkState>;
    const defaultMode: BookmarkMode = v.defaultMode === "manual" ? "manual" : "auto";
    const books: Record<string, Bookmark> = {};
    for (const [book, b] of Object.entries(v.books ?? {})) {
      if (!b || typeof b.ref !== "string") continue;
      books[book] = {
        book,
        ref: b.ref,
        mode: b.mode === "manual" ? "manual" : "auto",
        updated: typeof b.updated === "number" ? b.updated : 0,
        ...(typeof b.furthest === "string" ? { furthest: b.furthest } : {}),
        ...(isLayout(b.layout) ? { layout: { search: { ...b.layout.search } } } : {}),
      };
    }
    return { version: STATE_VERSION, defaultMode, books };
  } catch {
    return EMPTY_STATE;
  }
}

/** Most recently changed first. */
export const sortedBookmarks = (state: BookmarkState): Bookmark[] => Object.values(state.books).sort((a, b) => b.updated - a.updated);
