import type { RelatedLink } from "~/lib/connections/links";
import { expandRange } from "~/lib/connections/related";
import { parseHumanRef, urlToRef } from "~/lib/ref/url";
import { linkedSegmentsIn, sectionOfSegment } from "~/lib/workspace/linked-verses";
import { panelAt, panelOrder } from "~/lib/workspace/ops";
import type { Workspace } from "~/lib/workspace/types";
import { decodeWorkspace, encodeWorkspace, DEFAULT_URL_DEFAULTS, type UrlDefaults } from "~/lib/workspace/url";
import { compareRefs } from "./model";

/**
 * A bookmark's "My layout" is the workspace query without panel 1's ref: the companions, each panel's language and
 * versions, the sidebar and its view, and the arrangement. Panel 1's position always comes from where the reader is going.
 */

/** Query keys that describe a moment, not a setup: selection lookups, sidebar searches, a clicked name, the bk flag. */
const VOLATILE = /^(?:lookup|sbsq|namedEntity|namedEntityText)|^bk$/;
const PANEL_KEY = /^p\d+$/;

/** "Rashi on Berakhot 2a:1:1" → "Rashi on Berakhot". */
export const bookOf = (ref: string): string => parseHumanRef(ref).title;

const mainRefOf = (ws: Workspace): string | undefined => {
  const p = panelAt(ws, 0);
  return p?.kind === "text" ? p.ref : undefined;
};

type LayoutSearch = Record<string, string>;

/** The layout of what's on screen, as stored in a bookmark. */
export function layoutSearchOf(ws: Workspace, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS): LayoutSearch {
  const enc = encodeWorkspace({ ...ws, bk: undefined }, defaults);
  if (!enc) return {};
  return Object.fromEntries(Object.entries(enc.search).filter(([k]) => !VOLATILE.test(k)));
}

/** More than the main text alone: another panel or a sidebar. */
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

/** Whether the workspace differs from the saved layout (companion positions don't count). */
export function layoutModified(ws: Workspace, saved: LayoutSearch, defaults: UrlDefaults = DEFAULT_URL_DEFAULTS): boolean {
  return signature(layoutSearchOf(ws, defaults)) !== signature(saved);
}

/** The saved layout around `mainRef`, flagged as the viewer's own. Companion refs are as saved; see {@link placeCompanions}. */
export function workspaceFromLayout(mainRef: string, saved: LayoutSearch): Workspace {
  return decodeWorkspace(mainRef, { ...saved, bk: "1" });
}

/** The main text alone, in the reader's default language and versions. */
export function standardWorkspace(ws: Workspace): Workspace {
  const main = mainRefOf(ws);
  return main ? decodeWorkspace(main, {}) : ws;
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

/** The workspace with each companion moved to `mainRef` (panel 1's ref), using that section's links. */
export function placeCompanions(ws: Workspace, links: readonly RelatedLink[]): Workspace {
  const main = mainRefOf(ws);
  if (!main) return ws;
  const panels = { ...ws.panels };
  for (const id of panelOrder(ws).slice(1)) {
    const p = panels[id];
    if (p?.kind === "text") panels[id] = { ...p, ref: companionRefAt(links, main, p.ref) };
  }
  return { ...ws, panels };
}

/** Whether a navigation from `prev` to `next` keeps the bk flag: panel 1 still shows the same book. */
export function keepsBookmarkFlag(prev: Workspace, next: Workspace): boolean {
  const a = mainRefOf(prev);
  const b = mainRefOf(next);
  return Boolean(prev.bk && a && b && bookOf(a) === bookOf(b));
}

/** A link to share: the arrangement travels, the viewer's bookmark doesn't. */
export function stripBookmarkFlag(url: string): string {
  return url.replace(/([?&])bk=1(&|$)/, (_m, lead: string, tail: string) => (tail ? lead : "")).replace(/\?$/, "");
}

/** Every book on screen in a workspace (main texts and companions). */
export function booksOnScreen(ws: Workspace): string[] {
  return panelOrder(ws).flatMap((id) => {
    const p = ws.panels[id];
    return p?.kind === "text" ? [bookOf(p.ref)] : [];
  });
}
