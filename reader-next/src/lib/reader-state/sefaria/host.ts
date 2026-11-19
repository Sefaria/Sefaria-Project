/**
 * This app's ReaderHost (docs/READER_STATE_API.md, "The host contract"): binds the reader state core to TanStack's router. The location
 * is the address bar's path and query; the history-entry state is the entry's NavState with only what is worth replaying; navigation is
 * a router navigation by href (rule 3: every URL change goes through the router), so the reader reacts exactly as to the person's own.
 *
 * Safe on the server: nothing touches window until a method that needs it is called, and those degrade to no-ops there.
 */
import { frameOrTimeout } from "~/lib/reader-state/core/api";
import type { AnyRouter } from "@tanstack/react-router";
import type { ReaderHost, SliceRegistry } from "~/lib/reader-state/core/types";
import type { NavState } from "~/lib/workspace/commands";
import { acceptsUrl } from "./safe-url";

/** The slice of TanStack's router the host uses (so tests and other hosts can pass something smaller). */
export type HostRouter = Pick<AnyRouter, "state" | "history" | "navigate" | "subscribe">;

const NAV_KINDS = new Set(["scroll", "stay", "select", "go"]);
const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

/**
 * The NavState fields worth replaying, from an entry's state or a snapshot's nav. Router-internal keys (__TSR_key, __TSR_index, key)
 * belong to one history entry and must not travel; `canonical` only describes how this entry was made. Unknown or mistyped fields from a
 * foreign snapshot are dropped, so what reaches the router is always a well-formed NavState.
 */
export function replayableNav(state: unknown): NavState {
  if (!state || typeof state !== "object") return {};
  const s = state as Record<string, unknown>;
  const out: NavState = {};
  if (typeof s.nav === "string" && NAV_KINDS.has(s.nav)) out.nav = s.nav as NavState["nav"];
  if (typeof s.panel === "string") out.panel = s.panel as NavState["panel"];
  if (typeof s.ref === "string") out.ref = s.ref;
  if (isStringArray(s.terms)) out.terms = s.terms;
  if (isStringArray(s.panelKeys)) out.panelKeys = s.panelKeys;
  return out;
}

const hasWindow = () => typeof window !== "undefined";
/** jsdom has no layout: frames there are timers that only slow tests down. */
const isJsdom = () => typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);

/** Browsers stop animation frames in a hidden tab: a follower or player in a background tab would stall until shown. */
const framesRun = () => hasWindow() && typeof requestAnimationFrame === "function" && !(typeof document !== "undefined" && document.visibilityState === "hidden");
const nextFrame = () => new Promise<void>((resolve) => (framesRun() ? frameOrTimeout(resolve) : setTimeout(resolve, 0)));

/** How long settled() waits for a navigation that never resolves before giving up (the slices then apply to whatever is there). */
const SETTLE_TIMEOUT_MS = 15_000;

export function createSefariaHost(router: HostRouter, registry: SliceRegistry): ReaderHost {
  const idle = () => {
    const st = router.state;
    return st.status === "idle" && !st.isLoading && !st.matches.some((m: { status?: string }) => m.status === "pending");
  };
  const waitIdle = () =>
    new Promise<void>((resolve) => {
      if (idle()) return resolve();
      // onResolved marks the end of a load; the poll covers a navigation superseded or cancelled without one of its own
      const done = () => {
        unsub();
        clearInterval(poll);
        clearTimeout(limit);
        resolve();
      };
      const unsub = router.subscribe("onResolved", () => idle() && done());
      const poll = setInterval(() => idle() && done(), 50);
      const limit = setTimeout(done, SETTLE_TIMEOUT_MS);
    });

  return {
    getLocation() {
      // the history's own location is the address bar as written (a Hebrew path percent-encoded, the old grammar's query untouched)
      const loc = router.history.location;
      return { url: `${loc.pathname}${loc.search}`, nav: replayableNav(loc.state) };
    },
    async navigate(url, nav, mode) {
      // the API checks acceptsUrl first; checked again here because this is where an untrusted url would reach the router
      if (!acceptsUrl(url)) throw new Error(`reader-state: refused url ${JSON.stringify(url)}`);
      await router.navigate({ href: url, replace: mode === "replace", state: replayableNav(nav) as never, resetScroll: false });
    },
    async settled() {
      await waitIdle();
      // the route's data is in; two frames let React commit it and the browser lay it out before slices such as scroll measure
      if (framesRun() && !isJsdom()) {
        await nextFrame();
        await nextFrame();
      }
    },
    onLocationChange(cb) {
      return router.subscribe("onResolved", () => cb());
    },
    onLocalInput(cb) {
      if (!hasWindow()) return () => {};
      // capture phase: an input stops a follower even when a component stops the event's propagation
      // The reader state's own controls (the follow bar, the recording dock: marked data-reader-state-ui) are not the person moving the
      // reader: a click on "Follow again" or a face must not first count as breaking away.
      const input = (e: Event) => {
        if (e.target instanceof Element && e.target.closest("[data-reader-state-ui]")) return;
        cb("input");
      };
      const history = () => cb("history");
      const opts = { capture: true, passive: true } as const;
      const kinds = ["pointerdown", "wheel", "keydown", "touchstart"] as const;
      kinds.forEach((k) => window.addEventListener(k, input, opts));
      window.addEventListener("popstate", history, opts);
      return () => {
        kinds.forEach((k) => window.removeEventListener(k, input, opts));
        window.removeEventListener("popstate", history, opts);
      };
    },
    acceptsUrl,
    slices: registry,
    schedule(cb) {
      if (framesRun()) frameOrTimeout(cb);
      else if (hasWindow()) setTimeout(cb, 0);
      else queueMicrotask(cb);
    },
  };
}
