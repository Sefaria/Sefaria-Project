/**
 * A text open beside the social surface's page (contract/surface-host.v1.ts, SurfaceHost.openBeside, since 1.1). The reader's address
 * is the text's, carrying the reserved context `ctx=social.beside` (src/lib/reader/ctx.ts), so a refresh, a shared link or Back
 * reopens it the same way; the shell (src/routes/__root.tsx) then shows the surface's page in a column at the inline start and the
 * text beside it (src/features/surfaces/SurfaceMount.tsx keeps the page's element mounted while it moves between the two).
 *
 * This module is the plain part: which addresses are "beside", where the page that opened the text was (the page mount keeps
 * reporting it as its location), how to close (back through history when the page's entry is right behind, else a new entry for it)
 * and the animation (the View Transitions API, skipped where the browser lacks it or the reader asked for reduced motion).
 *
 * @feature SHL-079 A text beside the social page
 */
import { ctxOf, withCtx } from "~/lib/reader/ctx";
import { isReaderPath } from "~/lib/reader/paths";

/** The reserved context of a text open beside the social page. */
export const BESIDE_CTX = "social.beside";

/** The social surface's own pages. */
export const isSocialPath = (pathname: string) => pathname === "/social" || pathname.startsWith("/social/");

/** Is this location a text open beside the social page? */
export const isBeside = (loc: { pathname: string; search: string }) => isReaderPath(loc.pathname) && ctxOf(loc.search) === BESIDE_CTX;

/** The address of `to` (a reader address) opened beside: the reserved context replaced by social.beside. */
export const besideHref = (to: string) => withCtx(to, BESIDE_CTX);

/** A location as the surface sees it (the surface's own history state, not the reader's). */
export interface PageLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
}

/** Where the social page that opened the text was, and the history index of its entry (to close by going back to it). */
export interface BesideOrigin {
  location: PageLocation;
  index: number | null;
}

/** The page shown beside a text nobody opened in this tab (a refresh, a shared link): the feed. */
export const DEFAULT_ORIGIN: PageLocation = { pathname: "/social", search: "", hash: "", state: undefined };

/** One per page (module scope is per tab in the browser; the server never opens a text beside anything). */
let origin: BesideOrigin | null = null;
export const besideOrigin = () => origin;
export const setBesideOrigin = (next: BesideOrigin | null) => {
  origin = next;
};

/** The router's index of a history entry (TanStack keeps `__TSR_index` in each entry's state), or null. */
export function entryIndex(state: unknown): number | null {
  const i = state && typeof state === "object" ? (state as Record<string, unknown>).__TSR_index : undefined;
  return typeof i === "number" && Number.isInteger(i) && i >= 0 ? i : null;
}

/** The page's address as a path ("/social/u/x?tab=y#z"). */
export const pageHref = (l: PageLocation) => `${l.pathname}${l.search}${l.hash}`;

/**
 * How to close the text: go back `steps` entries when the opening page's entry is behind the current one in this tab, else push the
 * page's address (a text opened by a refresh or a link has nothing behind it to go back to).
 */
export function closePlan(current: { index: number | null }, o: BesideOrigin | null): { back: number } | { push: string } {
  if (o && o.index !== null && current.index !== null && current.index > o.index) return { back: current.index - o.index };
  return { push: pageHref(o?.location ?? DEFAULT_ORIGIN) };
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> } };

/** Run `update` (a navigation) as a view transition where the browser can and the reader has not asked for reduced motion. */
export function withTransition(update: () => Promise<void>, kind: "open" | "close"): Promise<void> {
  if (typeof document === "undefined") return update();
  const doc = document as ViewTransitionDocument;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) return update();
  // the stylesheet picks the direction from this (App.module.css: html[data-beside-transition])
  document.documentElement.dataset.besideTransition = kind;
  const t = doc.startViewTransition(update);
  return t.finished.catch(() => undefined).finally(() => {
    delete document.documentElement.dataset.besideTransition;
  });
}

/** Resolves on the next painted frame (the new state has rendered before the browser captures it). */
export const nextFrame = () => new Promise<void>((resolve) => (typeof requestAnimationFrame === "undefined" ? resolve() : requestAnimationFrame(() => setTimeout(resolve, 0))));

/** Resolves when `p` settles or after `ms`, whichever comes first (a slow preload never holds the click back for long). */
export const within = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, ms))]);
