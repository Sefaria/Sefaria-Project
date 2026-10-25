import type { RelatedLink } from "~/lib/connections/links";
import { expandRange } from "~/lib/connections/related";
import { parseHumanRef, refToUrl, urlToRef } from "~/lib/ref/url";
import { linkedSegmentsIn, sectionOfSegment } from "~/lib/workspace/linked-verses";
import { panelAt, panelOrder, updatePanel } from "~/lib/workspace/ops";
import type { TextPanelState, Workspace } from "~/lib/workspace/types";
import { decodeWorkspace, encodeWorkspace, DEFAULT_URL_DEFAULTS, type UrlDefaults } from "~/lib/workspace/url";
import { compareRefs } from "./model";
import { getBookmarks } from "./store";

/**
 * A bookmark's "My layout" is the workspace query without the main text's position: the companions, each panel's language
 * and versions, and the arrangement. The main text is the panel showing the bookmarked book, wherever it sits; its position
 * always comes from where the reader is going. When panel 1 is a companion, its ref is saved as `p1`. The Resources sidebar
 * is a moment, not part of the layout.
 */

/** Query keys that describe a moment, not a setup: selection lookups, sidebar searches, a clicked name, the bk flag. */
const VOLATILE = /^(?:lookup|sbsq|namedEntity|namedEntityText)|^bk$/;
const PANEL_KEY = /^p\d+$/;

/** "Rashi on Berakhot 2a:1:1" → "Rashi on Berakhot". */
export const bookOf = (ref: string): string => parseHumanRef(ref).title;

export type IsBookmarked = (book: string) => boolean;

export const isBookmarkedBook: IsBookmarked = (book) => Boolean(getBookmarks().books[book]);

const textPanels = (ws: Workspace): TextPanelState[] =>
  panelOrder(ws).flatMap((id) => {
    const p = ws.panels[id];
    return p?.kind === "text" ? [p] : [];
  });

/** The first panel in reading order showing `book`. */
export function panelShowing(ws: Workspace, book: string): TextPanelState | undefined {
  return textPanels(ws).find((p) => bookOf(p.ref) === book);
}

/** The main text: the first panel in reading order whose book has a bookmark, else panel 1. */
export function mainPanelOf(ws: Workspace, isBookmarked: IsBookmarked = isBookmarkedBook): TextPanelState | undefined {
  const texts = textPanels(ws);
  return texts.find((p) => isBookmarked(bookOf(p.ref))) ?? texts[0];
}

const mainBookOf = (ws: Workspace): string | undefined => {
  const p = mainPanelOf(ws);
  return p && bookOf(p.ref);
};

type LayoutSearch = Record<string, string>;

const withoutSidebars = (ws: Workspace): Workspace => ({
  ...ws,
  panels: Object.fromEntries(Object.entries(ws.panels).map(([id, p]) => [id, p && p.asides.length ? { ...p, asides: [], asideLayout: undefined } : p])),
});

/** The layout of what's on screen around `book` (default: the main text's), as stored in a bookmark. */
export function layoutSearchOf(ws: Workspace, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS, book: string | undefined = mainBookOf(ws)): LayoutSearch {
  const enc = encodeWorkspace({ ...withoutSidebars(ws), bk: undefined }, defaults);
  if (!enc) return {};
  const search = Object.fromEntries(Object.entries(enc.search).filter(([k]) => !VOLATILE.test(k)));
  const first = panelAt(ws, 0);
  const main = book === undefined ? undefined : panelShowing(ws, book);
  return first && main && main.id !== first.id ? { p1: refToUrl(first.ref), ...search } : search;
}

/** More than the main text alone: another panel (or a sidebar, in layouts saved before sidebars were left out). */
export function layoutHasCompanions(search: LayoutSearch): boolean {
  return Object.keys(search).some((k) => PANEL_KEY.test(k) || k === "with");
}

/** What a layout looks like, ignoring where each companion has scrolled to. */
function signature(search: LayoutSearch): string {
  const entries = Object.entries(search)
    .filter(([k]) => !VOLATILE.test(k))
    .map(([k, v]) => [k, PANEL_KEY.test(k) ? bookOf(urlToRef(v)) : v] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/** Whether the workspace differs from the saved layout around `book` (companion positions don't count). */
export function layoutModified(ws: Workspace, saved: LayoutSearch, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS, book: string | undefined = mainBookOf(ws)): boolean {
  return signature(layoutSearchOf(ws, defaults, book)) !== signature(saved);
}

/**
 * The saved layout with `mainRef` in the panel showing its book, flagged as the viewer's own. `extra` holds query params for
 * that panel, such as a version, written as for panel 1. Companion refs are as saved; see {@link placeCompanions}.
 */
export function workspaceFromLayout(mainRef: string, saved: LayoutSearch, extra: LayoutSearch = {}): Workspace {
  const { p1, ...rest } = saved;
  if (p1) {
    const firstRef = urlToRef(p1);
    const main = panelShowing(decodeWorkspace(firstRef, rest), bookOf(mainRef));
    if (main && main.id !== "p1") {
      const n = main.id.slice(1);
      const own = Object.fromEntries(Object.entries(extra).map(([k, v]) => [`${k}${n}`, v]));
      return updatePanel(decodeWorkspace(firstRef, { ...rest, ...own, bk: "1" }), main.id, { ref: mainRef });
    }
  }
  return decodeWorkspace(mainRef, { ...rest, ...extra, bk: "1" });
}

/**
 * The workspace a bookmark link opens at `ref`: the saved layout (flagged as the viewer's own) when it has companions, else
 * the main text alone. `extra` adds query params for the main text such as a version. Companions open where they were saved
 * and line up with the main text once it settles (scrolling together).
 */
export function bookmarkEntry(saved: LayoutSearch | undefined, ref: string, extra: LayoutSearch = {}): Workspace {
  return saved && layoutHasCompanions(saved) ? workspaceFromLayout(ref, saved, extra) : decodeWorkspace(ref, extra);
}

const hasCompanionPanels = (ws: Workspace) => panelOrder(ws).length > 1;

/**
 * What a change from `prev` to `next` does to the bookmark of `book` (`saved` is its layout; the caller has checked the
 * bookmark exists and `book` is the main text). While My layout is on, any change to the arrangement is saved. Without it,
 * opening a companion beside a bookmark that has no layout yet makes this arrangement My layout ("adopt").
 */
export function layoutAutosave(
  prev: Workspace | undefined,
  next: Workspace,
  saved: LayoutSearch | undefined,
  book: string,
  defaults: UrlDefaults = DEFAULT_URL_DEFAULTS,
): { save: LayoutSearch; adopt: boolean } | undefined {
  if (!panelShowing(next, book)) return undefined;
  if (next.bk) return !saved || layoutModified(next, saved, defaults, book) ? { save: layoutSearchOf(next, defaults, book), adopt: false } : undefined;
  if (saved && layoutHasCompanions(saved)) return undefined;
  const opened = prev && panelShowing(prev, book) && !hasCompanionPanels(prev) && hasCompanionPanels(next);
  return opened ? { save: layoutSearchOf(next, defaults, book), adopt: true } : undefined;
}

/** The main text (the panel showing `book`) alone, in the reader's default language and versions. */
export function standardWorkspace(ws: Workspace, book: string | undefined = mainBookOf(ws)): Workspace {
  const main = book === undefined ? undefined : panelShowing(ws, book);
  return main ? decodeWorkspace(main.ref, {}) : ws;
}

/**
 * Where a companion should open when the main text is at `mainRef`, given the links of `mainRef`'s section: the
 * companion's comment on that verse; else its nearest comment in the section; else, for a commentary on the main book,
 * the same section of the commentary; else where it was saved.
 */
export function companionRefAt(links: readonly RelatedLink[], mainRef: string, savedRef: string): string {
  const mainBook = bookOf(mainRef);
  const book = bookOf(savedRef);
  if (book === mainBook) return mainRef;
  const linked = linkedSegmentsIn(links, mainRef, mainBook, book)[0];
  if (linked) return linked;
  const inSection = links.filter((l) => l.index_title === book).sort((a, b) => (compareRefs(a.anchorRef, b.anchorRef) ?? 0));
  if (inSection.length) {
    const next = inSection.find((l) => (compareRefs(l.anchorRef, mainRef) ?? 0) >= 0) ?? inSection.at(-1)!;
    return expandRange(next.sourceRef)[0] ?? next.sourceRef;
  }
  const section = sectionOfSegment(mainRef);
  if (book.endsWith(` on ${mainBook}`) && section.startsWith(mainBook)) return `${book}${section.slice(mainBook.length)}`;
  return savedRef;
}

/** The workspace with each companion moved to the verse of the main text (the panel showing `book`), using that section's links. */
export function placeCompanions(ws: Workspace, links: readonly RelatedLink[], book: string | undefined = mainBookOf(ws)): Workspace {
  const main = book === undefined ? undefined : panelShowing(ws, book);
  if (!main) return ws;
  const panels = { ...ws.panels };
  for (const p of textPanels(ws)) {
    if (p.id !== main.id) panels[p.id] = { ...p, ref: companionRefAt(links, main.ref, p.ref) };
  }
  return { ...ws, panels };
}

/**
 * Whether a navigation from `prev` to `next` keeps the bk flag: the main text is still the same book, wherever it sits, so
 * the flag survives moving, opening, closing and resizing companions. It drops when the main panel goes to another book.
 */
export function keepsBookmarkFlag(prev: Workspace, next: Workspace, isBookmarked: IsBookmarked = isBookmarkedBook): boolean {
  const a = mainPanelOf(prev, isBookmarked);
  const b = mainPanelOf(next, isBookmarked);
  return Boolean(prev.bk && a && b && bookOf(a.ref) === bookOf(b.ref));
}

/** A link to share: the arrangement travels, the viewer's bookmark doesn't. */
export function stripBookmarkFlag(url: string): string {
  return url.replace(/([?&])bk=1(&|$)/, (_m, lead: string, tail: string) => (tail ? lead : "")).replace(/\?$/, "");
}

/** Every book on screen in a workspace (main texts and companions). */
export function booksOnScreen(ws: Workspace): string[] {
  return textPanels(ws).map((p) => bookOf(p.ref));
}
