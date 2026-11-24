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

/** The reserved context of a text open beside the social page. */
export const BESIDE_CTX = "social.beside";

/** The social surface's own pages. */
export const isSocialPath = (pathname: string) => pathname === "/social" || pathname.startsWith("/social/");

/**
 * Is this location open beside the social page? A text, usually; but a followed shiur (Sefaria Social spec 032) goes wherever its
 * leader goes, the library or a topic too, and keeps the context, so any reader page but social's own stays beside the page.
 */
export const isBeside = (loc: { pathname: string; search: string }) => !isSocialPath(loc.pathname) && ctxOf(loc.search) === BESIDE_CTX;

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

/**
 * Whether the social page's column beside a text is collapsed to a rail at the inline start (the text takes the row; the page stays
 * mounted, its state and place kept, and comes back as it was). A per-tab view choice, not part of the address: a text opened beside
 * the page comes in with the column open, and closing the text forgets it. Desktop only: on a phone the text already covers the page.
 */
let collapsed = false;
const collapsedSubs = new Set<() => void>();
export const besideCollapsed = () => collapsed;
export function setBesideCollapsed(next: boolean): void {
  if (collapsed === next) return;
  collapsed = next;
  collapsedSubs.forEach((cb) => cb());
}
export const subscribeBesideCollapsed = (cb: () => void) => (collapsedSubs.add(cb), () => void collapsedSubs.delete(cb));

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

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> };
};

/** Run `update` (a navigation) as a view transition where the browser can and the reader has not asked for reduced motion. */
export function withTransition(update: () => Promise<void>, kind: "open" | "close"): Promise<void> {
  if (typeof document === "undefined") return update();
  const doc = document as ViewTransitionDocument;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) return update();
  // the stylesheet picks the direction from this (App.module.css: html[data-beside-transition])
  document.documentElement.dataset.besideTransition = kind;
  const t = doc.startViewTransition(update);
  // a transition the browser skips (a timeout, another one starting) rejects these; the navigation itself has happened
  void t.ready?.catch(() => undefined);
  void t.updateCallbackDone?.catch(() => undefined);
  return t.finished.catch(() => undefined).finally(() => {
    delete document.documentElement.dataset.besideTransition;
  });
}

/**
 * Resolves once the page shows the beside layout (`open`) or no longer does (`close`), or after `ms`: the browser captures the new
 * state when a transition's update resolves, so it waits for React to have rendered it. Polls with timers: a view transition's
 * update runs while the browser renders no frames, so requestAnimationFrame would never fire.
 */
export function rendered(kind: "open" | "close", ms = 1_000): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  // the document can go between ticks (a test environment torn down while a transition is still settling): stop then
  const done = () => typeof document === "undefined" || !!document.querySelector("[data-social-beside=pane]") === (kind === "open");
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => (done() || Date.now() - start > ms ? setTimeout(resolve, 0) : setTimeout(tick, 16));
    tick();
  });
}

/** Resolves when `p` settles or after `ms`, whichever comes first (a slow preload never holds the click back for long). */
export const within = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, ms))]);

/** The slice of the router closing needs (TanStack's router; src/lib/surfaces/host.ts SurfaceRouter is a superset). */
export interface BesideRouter {
  history: { location: { state: unknown }; subscribe: (cb: () => void) => () => void; go?: (delta: number) => void };
  navigate: (opts: { href: string }) => Promise<void> | void;
}

/** Resolves after the router's location next changes, or after `ms`. */
function locationChange(router: BesideRouter, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      off();
      resolve();
    };
    const off = router.history.subscribe(done);
    const t = setTimeout(done, ms);
  });
}

/**
 * Closes a text open beside the social page: back to the page's own history entry when it is behind this one (as Back would), else a
 * new entry for the page (a text reached by a refresh or a link). Animated like the opening (./beside.ts withTransition).
 */
export function closeBeside(router: BesideRouter): Promise<void> {
  const plan = closePlan({ index: entryIndex(router.history.location.state) }, besideOrigin());
  return withTransition(async () => {
    if ("back" in plan && router.history.go) {
      const changed = locationChange(router, 1_000);
      router.history.go(-plan.back);
      await changed;
    } else await within(Promise.resolve(router.navigate({ href: "push" in plan ? plan.push : DEFAULT_ORIGIN.pathname })), 2_500);
    await rendered("close");
  }, "close");
}

