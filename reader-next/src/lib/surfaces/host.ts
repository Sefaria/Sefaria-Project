/**
 * The SurfaceHost v1 object (contract/surface-host.v1.ts) the reader hands a surface, built from the reader's own pieces: its router
 * (the only owner of the address bar), the reader state API, the workspace commands, the signed-in reader, the interface language
 * and theme, the surface's deployment settings, and the reader's error reporting and analytics. Everything React-specific is passed
 * in (src/features/surfaces/SurfaceMount.tsx builds the dependencies), so this module is plain and testable.
 *
 * @feature SHL-078 SurfaceHost v1
 */
import type { ReaderStateApi } from "~/lib/reader-state/core/types";
import type { WorkspaceCommands } from "~/lib/workspace/commands";
import type { SocialEnv } from "~/lib/config";
import { ctxOf } from "~/lib/reader/ctx";
import { acceptsUrl } from "~/lib/reader-state/sefaria/safe-url";
import { isReaderPath } from "~/lib/reader/paths";
import { besideHref, besideOrigin, DEFAULT_ORIGIN, entryIndex, isBeside, isSocialPath, rendered, setBesideOrigin, within, withTransition, type PageLocation } from "./beside";
import type { SurfaceHost, Unsubscribe } from "../../../contract/surface-host.v1";
import { SURFACE_HOST_CONTRACT } from "../../../contract/surface-host.v1";

/** The slice of TanStack's router the host uses. */
export interface SurfaceRouter {
  history: {
    location: { pathname: string; search: string; hash: string; state: unknown };
    subscribe: (cb: () => void) => () => void;
    /** Moves through history (TanStack's history.go); used to close a text opened beside the page by going back to the page. */
    go?: (delta: number) => void;
  };
  navigate: (opts: { href: string; replace?: boolean; state?: Record<string, unknown>; resetScroll?: boolean }) => Promise<void> | void;
  /** Loads a route's data ahead of navigating (TanStack's preloadRoute), so the text is ready when it slides in. */
  preloadRoute?: (opts: { href: string }) => Promise<unknown>;
}

export interface HostViewer {
  id: number;
  name: string;
  imageUrl?: string;
}

export interface UiState {
  interfaceLang: "english" | "hebrew";
  theme: "light" | "dark" | "sepia";
}

export interface SurfaceHostDeps {
  router: SurfaceRouter;
  /**
   * Which mount this host is for. The page mount's location stays on the social page that opened a text beside it (openBeside), the
   * persistent mount's is always the reader's. Default "page".
   */
  kind?: "page" | "persistent";
  state: ReaderStateApi;
  commands: WorkspaceCommands;
  viewer: { get: () => HostViewer | null; subscribe: (cb: () => void) => Unsubscribe };
  identityToken: () => Promise<string>;
  requestSignIn: () => void;
  ui: { get: () => UiState; subscribe: (cb: () => void) => Unsubscribe };
  config: SocialEnv | undefined;
  /** The release, tagged on every report. */
  version: string;
  /** Is this path one Django serves (a full page load)? lib/routing/django-paths.ts leavesClient. */
  leavesClient: (pathname: string) => boolean;
  /** Where Django's pages are ("" = this site). */
  siteOrigin: string;
  /** A full page load (Django's pages). */
  load: (href: string, replace: boolean) => void;
  reportError: (error: Error, where: string) => void;
  event: (name: string, params: Record<string, string | number | boolean | null>) => void;
}

/** The key under which the surface's own history state is kept in a reader entry's state (apart from the reader's NavState). */
export const SURFACE_STATE_KEY = "surface";

const BASE = "https://x.invalid";
/** A same-site path, as written: "/x", not "//x", no backslash, no control character. */
function sameSitePath(to: unknown): to is string {
  if (typeof to !== "string" || !to.startsWith("/") || to.startsWith("//") || to.includes("\\") || /[\u0000-\u001f\u007f-\u009f]/.test(to)) return false; // eslint-disable-line no-control-regex -- refuses control characters on purpose
  try {
    return new URL(to, BASE).origin === BASE;
  } catch {
    return false;
  }
}
const pathOf = (to: string) => new URL(to, BASE).pathname;

/** Analytics parameters: primitives only (a nested value is dropped, a long string cut). */
function flat(data: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

/** The reader's location as a surface sees it: the surface's own history state, not the reader's. */
function realLocation(router: SurfaceRouter): PageLocation {
  const l = router.history.location;
  const state = l.state && typeof l.state === "object" ? (l.state as Record<string, unknown>)[SURFACE_STATE_KEY] : undefined;
  return { pathname: l.pathname, search: l.search, hash: l.hash, state };
}

export { closeBeside } from "./beside";

export function createSurfaceHost(d: SurfaceHostDeps): SurfaceHost {
  const loc = () => d.router.history.location;
  const page = (d.kind ?? "page") === "page";
  /** What this mount reports as its location: beside a text, the page mount stays on the social page that opened it. */
  const location = (): PageLocation => (page && isBeside(loc()) ? (besideOrigin()?.location ?? DEFAULT_ORIGIN) : realLocation(d.router));
  const report: SurfaceHost["report"] = (event) => {
    const name = typeof event?.name === "string" ? event.name.slice(0, 100) : "unnamed";
    if (event?.kind === "error") {
      const detail = flat(event.data);
      const msg = typeof detail.message === "string" ? `: ${detail.message}` : "";
      d.reportError(new Error(`[surface social@${d.version}] ${name}${msg}`), `surface:social@${d.version}`);
    } else d.event(`social_${name}`, { ...flat(event?.data), surface_version: d.version });
  };
  const host: SurfaceHost = {
    contract: { major: SURFACE_HOST_CONTRACT.major, minor: SURFACE_HOST_CONTRACT.minor },
    location: {
      get: location,
      subscribe(cb) {
        // beside a text, the reader's own moves (a scroll's replace, another verse, the sidebar) leave the page mount's location as it
        // was: it hears nothing until the text closes
        let was = page && isBeside(loc()) ? besideOrigin() : undefined;
        return d.router.history.subscribe(() => {
          const now = page && isBeside(loc()) ? besideOrigin() : undefined;
          const quiet = was !== undefined && now === was;
          was = now;
          if (!quiet) cb();
        });
      },
    },
    navigate(to, opts = {}) {
      if (acceptsUrl(to)) {
        const go = () => d.router.navigate({ href: to, replace: !!opts.replace, state: opts.state === undefined ? {} : { [SURFACE_STATE_KEY]: opts.state } });
        // leaving a text beside the page for another of the surface's pages: the text slides away as it would on close
        if (isBeside(loc()) && isSocialPath(pathOf(to)))
          void withTransition(async () => {
            await within(Promise.resolve(go()), 2_500);
            await rendered("close");
          }, "close");
        else void go();
        return;
      }
      if (sameSitePath(to) && d.leavesClient(pathOf(to))) return d.load(`${d.siteOrigin}${to}`, !!opts.replace);
      report({ kind: "error", name: "navigate-refused", data: { message: "not a same-site path" } });
    },
    openBeside(to) {
      if (!acceptsUrl(to) || !isReaderPath(pathOf(to))) {
        report({ kind: "error", name: "open-beside-refused", data: { message: "not a reader address" } });
        return;
      }
      const l = loc();
      // the page that opens the text, kept while texts are swapped beside it (a refresh beside a text knows none: the feed)
      if (!isBeside(l)) setBesideOrigin(isSocialPath(l.pathname) ? { location: realLocation(d.router), index: entryIndex(l.state) } : { location: DEFAULT_ORIGIN, index: null });
      const href = besideHref(to);
      void (async () => {
        // the text's data first (briefly: a slow network never holds the click back), so it is there when it slides in
        if (d.router.preloadRoute) await within(d.router.preloadRoute({ href }), 700);
        await withTransition(async () => {
          // the browser gives a view transition's update a few seconds; a text slower than that appears without the slide
          await within(Promise.resolve(d.router.navigate({ href, state: {} })), 2_500);
          await rendered("open");
        }, "open");
      })();
    },
    href(to) {
      if (acceptsUrl(to)) return to;
      if (sameSitePath(to) && d.leavesClient(pathOf(to))) return `${d.siteOrigin}${to}`;
      return "#";
    },
    reader: {
      state: d.state,
      commands: d.commands,
      context: {
        get: () => ctxOf(loc().search),
        subscribe(cb) {
          let last = ctxOf(loc().search);
          return d.router.history.subscribe(() => {
            const now = ctxOf(loc().search);
            if (now === last) return;
            last = now;
            cb();
          });
        },
      },
    },
    viewer: {
      get: () => {
        const v = d.viewer.get();
        return v ? { id: v.id, name: v.name, ...(v.imageUrl ? { imageUrl: v.imageUrl } : {}) } : null;
      },
      subscribe: (cb) => d.viewer.subscribe(cb),
      identityToken: () => d.identityToken(),
      requestSignIn: () => d.requestSignIn(),
    },
    ui: {
      get interfaceLang() {
        return d.ui.get().interfaceLang;
      },
      get theme() {
        return d.ui.get().theme;
      },
      subscribe: (cb) => d.ui.subscribe(cb),
    },
    config: { apiOrigin: d.config?.apiOrigin ?? "", relayOrigin: d.config?.relayOrigin ?? "", environment: d.config?.environment ?? "local" },
    report,
  };
  return host;
}
