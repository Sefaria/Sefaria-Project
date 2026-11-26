/**
 * Where the social surface sits in the page (contract/surface-host.v1.ts): the page mount under /social/* (src/routes/social.*, a
 * route chunk) and the persistent mount beside <main> on every page (src/routes/__root.tsx loads it lazily, after hydration:
 * ./SurfacePersistentSlot.tsx), both only while the `social` lab is on, so a reader without the lab downloads none of this. Each renders an empty
 * element of its own, loads the surface in the browser (src/lib/surfaces/load.ts, shared by both mounts) and hands it the element and
 * the SurfaceHost. Nothing the surface does can break the reader: a failed load, a mount that throws or a render error inside this
 * component is reported. The persistent mount then stays empty; the page mount says Social could not load and offers to try again
 * (or, for a pull request's preview, to go back to the current version: src/lib/surfaces/version.ts).
 *
 * @feature SHL-076 Social lab and /social routes
 * @feature SHL-077 Surface loader
 * @feature SHL-078 SurfaceHost v1
 * @feature SHL-080 SurfaceHost 1.2: the reader's chrome insets (rebuild)
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { PUBLIC_CONFIG, SITE_ORIGIN } from "~/lib/config";
import { postJson } from "~/lib/auth/http";
import { withNext } from "~/lib/auth/utils";
import { browserHost, leavesClient } from "~/lib/routing/django-paths";
import { reportError } from "~/lib/monitoring/error-reporter";
import { ReportingBoundary } from "~/lib/monitoring/ErrorBoundary";
import { gtagEvent } from "~/lib/analytics";
import { useInterfaceLang } from "~/lib/i18n/interface-lang";
import { createWorkspaceCommands, urlDefaultsFor, type WorkspaceRouter } from "~/lib/workspace/commands";
import type { UrlDefaults } from "~/lib/workspace/url";
import type { Viewer } from "~/lib/auth/session";
import { getSurface, resetSurfaceLoader } from "~/lib/surfaces/load";
import { createChromeInsets } from "~/lib/surfaces/chrome";
import { SOCIAL_VERSION_PARAM, socialEnvForPage, socialVersionCookie, socialVersionFromCookie } from "~/lib/surfaces/version";
import { Button } from "~/ui/Button/Button";
import { setSocialCookie } from "~/features/shell/social-optin";
import { optInThroughSocial } from "~/features/shell/reader-choice";
import { ErrorState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { createIdentityTokenSource } from "~/lib/surfaces/identity";
import { closeBeside, createSurfaceHost, type SurfaceRouter, type UiState } from "~/lib/surfaces/host";
import { viewerQuery } from "~/features/auth/viewer";
import { useReaderSettings } from "~/features/reader/settings-context";
import { useReaderState } from "~/features/reader-state/context";
import type { SurfaceHost } from "../../../contract/surface-host.v1";
import styles from "./SurfaceMount.module.css";

type HostFactory = (version: string, kind: "page" | "persistent") => SurfaceHost;

/** A tiny store: the value, read at call time, and who to tell when it changes. */
function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (JSON.stringify(next) === JSON.stringify(value)) return;
      value = next;
      for (const cb of [...subs]) cb();
    },
    subscribe(cb: () => void) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
  };
}

const viewerOf = (qc: QueryClient) => qc.getQueryData<Viewer | null>(viewerQuery.queryKey) ?? null;
const themeOf = (): UiState["theme"] => {
  const t = typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;
  return t === "dark" || t === "sepia" ? t : "light";
};

interface HostParts {
  factory: HostFactory;
  ui: ReturnType<typeof store<UiState>>;
  defaults: { current: UrlDefaults };
}
/** One set of host parts per router (per page in the browser), shared by the page and persistent mounts. */
const perRouter = new WeakMap<object, HostParts>();

/**
 * The SurfaceHost factory for this page: its fixed parts (the router, the state API, the query client, the identity token cache) built
 * once per router, its changing ones (URL defaults from the reader's settings, the interface language) kept current by every mount.
 * Null outside the reader state provider.
 */
function useHostFactory(): HostFactory | null {
  const router = useRouter();
  const qc = useQueryClient();
  const readerState = useReaderState();
  const { settings } = useReaderSettings();
  const interfaceLang = useInterfaceLang();
  const [parts] = useState<HostParts | null>(() => {
    const had = perRouter.get(router);
    if (had || !readerState) return had ?? null;
    const defaults = { current: urlDefaultsFor(settings) };
    const ui = store<UiState>({ interfaceLang, theme: themeOf() });
    // SurfaceHost 1.2 ui.chrome: one measurement for both mounts (src/lib/surfaces/chrome.ts). Browser only: this runs while the
    // server renders too, where there is nothing to measure and the surface never mounts.
    const chrome =
      typeof document === "undefined"
        ? undefined
        : createChromeInsets({
            doc: document,
            win: window,
            dir: () => (getComputedStyle(document.documentElement).direction === "rtl" ? "rtl" : "ltr"),
          });
    const commands = createWorkspaceCommands(router as unknown as WorkspaceRouter, () => defaults.current);
    const identityToken = createIdentityTokenSource({ post: postJson, viewerId: () => viewerOf(qc)?.id ?? null });
    const viewer = {
      get: () => viewerOf(qc),
      subscribe(cb: () => void) {
        let last = JSON.stringify(viewerOf(qc));
        return qc.getQueryCache().subscribe(() => {
          const now = JSON.stringify(viewerOf(qc));
          if (now === last) return;
          last = now;
          cb();
        });
      },
    };
    const factory: HostFactory = (version, kind) =>
      createSurfaceHost({
        router: router as unknown as SurfaceRouter,
        kind,
        state: readerState.api,
        commands,
        viewer,
        identityToken,
        requestSignIn: () => {
          const l = router.history.location;
          void router.navigate({ href: withNext("/login", `${l.pathname}${l.search}${l.hash}`) });
        },
        ui,
        chrome,
        config: socialEnvForPage(PUBLIC_CONFIG.social),
        version,
        leavesClient: (pathname) => leavesClient(pathname, browserHost(), PUBLIC_CONFIG.voicesOrigin),
        siteOrigin: SITE_ORIGIN,
        load: (href, replace) => (replace ? window.location.replace(href) : window.location.assign(href)),
        reportError: (error, where) => void reportError("boundary", error, { boundary: where }),
        event: (name, params) => gtagEvent(name, params),
      });
    const made = { factory, ui, defaults };
    perRouter.set(router, made);
    return made;
  });
  if (parts) parts.defaults.current = urlDefaultsFor(settings);
  useEffect(() => parts?.ui.set({ interfaceLang, theme: themeOf() }), [parts, interfaceLang]);
  return parts?.factory ?? null;
}

/** Loads the surface and mounts one of its views into `target`; returns how to unmount it. Failures are reported, never thrown. */
function mountInto(target: HTMLElement, kind: "page" | "persistent", hostFor: HostFactory, pathname: string, onFailed: () => void): () => void {
  let unmount: (() => void) | undefined;
  let gone = false;
  getSurface(socialEnvForPage(PUBLIC_CONFIG.social), pathname).then(
    ({ surface, version }) => {
      if (gone) return;
      try {
        const fn = kind === "page" ? surface.mountPage(target, hostFor(version, "page")) : surface.mountPersistent(target, hostFor(version, "persistent"));
        unmount = typeof fn === "function" ? fn : undefined;
        target.dataset.surfaceState = "mounted";
      } catch (e) {
        reportError("boundary", e, { boundary: `surface:social@${version}:${kind}` });
        target.replaceChildren();
        onFailed();
      }
    },
    (e: unknown) => {
      if (gone) return;
      // reported once per load (both mounts share it): the page mount reports, the persistent one stays quiet
      if (kind === "page" || !document.querySelector("[data-surface-mount=page]")) reportError("boundary", e, { boundary: "surface:social:load" });
      onFailed();
    },
  );
  return () => {
    gone = true;
    try {
      unmount?.();
    } catch (e) {
      reportError("boundary", e, { boundary: `surface:social:${kind}:unmount` });
    }
    target.replaceChildren();
    delete target.dataset.surfaceState;
  };
}

/**
 * The page view's element, kept mounted while it moves between its two slots: the /social page (src/routes/social.*) and the column
 * beside a text (SurfaceBesidePane, src/routes/__root.tsx). Opening a text beside the page unmounts the route's slot and mounts the
 * pane's in the same commit; the element moves from one to the other, so the surface keeps its state, its data and its place. With
 * no slot holding it after that commit, the surface is unmounted.
 */
const kept: {
  el: HTMLDivElement | null;
  unmount: (() => void) | null;
  failed: boolean;
  slot: HTMLElement | null;
  release: ReturnType<typeof setTimeout> | null;
  onState: Set<() => void>;
  /** How far the /social page was scrolled, for the column beside a text to start at the same place. */
  top: number;
  offScroll: (() => void) | null;
} = {
  top: 0,
  offScroll: null,
  el: null,
  unmount: null,
  failed: false,
  slot: null,
  release: null,
  onState: new Set(),
};

function acquirePage(slot: HTMLElement, hostFor: HostFactory, pathname: string) {
  if (kept.release) clearTimeout(kept.release);
  kept.release = null;
  if (!kept.el) {
    const el = document.createElement("div");
    el.className = styles.kept!;
    kept.el = el;
    kept.failed = false;
    kept.unmount = mountInto(el, "page", hostFor, pathname, () => {
      kept.failed = true;
      kept.onState.forEach((cb) => cb());
    });
  }
  slot.appendChild(kept.el);
  kept.slot = slot;
  kept.offScroll?.();
  kept.offScroll = null;
  if (slot.dataset.surfaceSlot === "beside") {
    // beside a text the page scrolls its own column, from where it was on /social (back on /social, the router restores the place)
    slot.scrollTop = kept.top;
  } else {
    const scroller = pageScroller();
    const note = () => void (kept.top = scroller === window ? window.scrollY : (scroller as HTMLElement).scrollTop);
    note();
    scroller.addEventListener("scroll", note, { passive: true });
    kept.offScroll = () => scroller.removeEventListener("scroll", note);
  }
  return kept.el;
}

const RELEASE_GRACE_MS = 1_500;

function releasePage(slot: HTMLElement) {
  if (kept.slot !== slot) return;
  // stop noting the /social page's place now: the reader's text takes over the main area and scrolls it next
  kept.offScroll?.();
  kept.offScroll = null;
  // the other slot may take a moment to arrive (the column beside a text renders after a lazy chunk resolves): the surface stays
  // mounted, off the page, for a grace period before it is unmounted
  kept.release = setTimeout(() => {
    kept.release = null;
    if (kept.el && kept.slot === slot && !kept.el.isConnected) {
      kept.unmount?.();
      kept.el = null;
      kept.unmount = null;
      kept.slot = null;
    }
  }, RELEASE_GRACE_MS);
}

/** What scrolls the /social page: the main area on desktop, the window on a phone (App.module.css). */
function pageScroller(): HTMLElement | Window {
  const main = document.getElementById("main");
  return main && getComputedStyle(main).overflowY !== "visible" ? main : window;
}

/** Forget a failed page view so the next acquirePage loads the surface again (the loader too: it keeps a failure per page). */
function forgetFailedPage() {
  if (!kept.failed) return;
  kept.unmount?.();
  kept.el?.remove();
  kept.el = null;
  kept.unmount = null;
  kept.failed = false;
  resetSurfaceLoader();
}

/** The pull request preview this page asked for (`?social_version=`), when previews are on here; null for the configured deployment. */
function previewVersion(): string | null {
  const env = PUBLIC_CONFIG.social;
  if (typeof document === "undefined" || !env?.previews || env.environment === "production") return null;
  return socialVersionFromCookie(document.cookie);
}

/** Back to the configured deployment: forget the preview and reload this address without `?social_version=`. */
function leavePreview() {
  document.cookie = socialVersionCookie(null, window.location.protocol === "https:");
  const url = new URL(window.location.href);
  url.searchParams.delete(SOCIAL_VERSION_PARAM);
  window.location.replace(url.href);
}

/** In place of the page view when the surface did not load: what happened and the way back (never a blank page). */
function PageLoadFailed({ onRetry }: { onRetry: () => void }) {
  const [preview] = useState(previewVersion);
  return (
    <div className={styles.failed} data-testid="surface-load-failed">
      {preview ? (
        <ErrorState
          title={<InterfaceText en={`Couldn't load Social preview #${preview}`} he={`לא ניתן לטעון את גרסת התצוגה המקדימה #${preview} של Social`} />}
          action={
            <Button onClick={leavePreview} data-testid="surface-leave-preview">
              <InterfaceText en="Use the current version" he="מעבר לגרסה הנוכחית" />
            </Button>
          }
        >
          <InterfaceText
            en={`This page asked for pull request ${preview}'s preview, which may have been merged or closed.`}
            he={`הדף ביקש את התצוגה המקדימה של בקשת המשיכה ${preview}, שייתכן שמוזגה או נסגרה.`}
          />
        </ErrorState>
      ) : (
        <ErrorState
          title={<InterfaceText en="Couldn't load Sefaria Social" he="לא ניתן לטעון את Sefaria Social" />}
          action={
            <Button onClick={onRetry} data-testid="surface-retry">
              <InterfaceText en="Try again" he="ניסיון נוסף" />
            </Button>
          }
        >
          <InterfaceText en="We couldn't reach Social. Check your connection and try again." he="לא הצלחנו להתחבר ל-Social. בדקו את החיבור ונסו שוב." />
        </ErrorState>
      )}
    </div>
  );
}

function PageSlot({ where }: { where: "route" | "beside" }) {
  const slot = useRef<HTMLDivElement>(null);
  const hostFor = useHostFactory();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useLayoutEffect(() => {
    if (!hostFor || !slot.current) return;
    const target = slot.current;
    const sync = () => setFailed(kept.failed);
    kept.onState.add(sync);
    acquirePage(target, hostFor, router.history.location.pathname);
    sync();
    // the surface marks the element it mounted; the slot carries the same state for whoever looks at the page
    const watch = new MutationObserver(() => {
      if (kept.el?.dataset.surfaceState) target.dataset.surfaceState = kept.el.dataset.surfaceState;
    });
    if (kept.el) watch.observe(kept.el, { attributes: true, attributeFilter: ["data-surface-state"] });
    if (kept.el?.dataset.surfaceState) target.dataset.surfaceState = kept.el.dataset.surfaceState;
    return () => {
      watch.disconnect();
      kept.onState.delete(sync);
      releasePage(target);
    };
  }, [hostFor, router, attempt]);
  const retry = () => {
    forgetFailedPage();
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return (
    <>
      {failed ? <PageLoadFailed onRetry={retry} /> : null}
      <div
        ref={slot}
        className={where === "beside" ? styles.beside : styles.page}
        data-surface-mount="page"
        data-surface-slot={where}
        data-surface-state={failed ? "failed" : undefined}
        hidden={failed || undefined}
      />
    </>
  );
}

function PersistentMount() {
  const el = useRef<HTMLDivElement>(null);
  const hostFor = useHostFactory();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!hostFor || !el.current) return;
    return mountInto(el.current, "persistent", hostFor, router.history.location.pathname, () => setFailed(true));
  }, [hostFor, router]);
  return <div ref={el} className={styles.persistent} data-surface-mount="persistent" data-surface-state={failed ? "failed" : undefined} />;
}

/** The page mount: an empty, sized element (no layout shift when the surface fills it) under /social/*. */
export function SurfacePage() {
  // a Social page opts its reader in to the new reader: this browser by Social's routing cookie (shell/social-optin.ts), a signed-in
  // reader's account for good (shell/reader-choice.ts optInThroughSocial)
  const qc = useQueryClient();
  const viewerId = useSyncedViewerId(qc);
  useEffect(() => setSocialCookie(), []);
  useEffect(() => {
    void optInThroughSocial(viewerId).catch((e: unknown) => reportError("error", e));
  }, [viewerId]);
  return (
    <ReportingBoundary name="surface-page" fallback={() => <div className={styles.page} data-surface-mount="page" data-surface-state="failed" />}>
      <PageSlot where="route" />
    </ReportingBoundary>
  );
}

/** The signed-in viewer's id, kept up to date (null while signed out or not yet known). */
function useSyncedViewerId(qc: QueryClient): number | string | null {
  const [id, setId] = useState(() => viewerOf(qc)?.id ?? null);
  useEffect(() => {
    setId(viewerOf(qc)?.id ?? null);
    return qc.getQueryCache().subscribe(() => setId(viewerOf(qc)?.id ?? null));
  }, [qc]);
  return id;
}

/** The same page view in the column beside a text (SurfaceHost.openBeside): the element the /social page had, moved here. */
export function SurfaceBesideMount() {
  return (
    <ReportingBoundary name="surface-beside" fallback={() => null}>
      <PageSlot where="beside" />
    </ReportingBoundary>
  );
}

/** Closes the text beside the social page (src/lib/surfaces/host.ts closeBeside). */
export function useCloseBeside() {
  const router = useRouter();
  return () => void closeBeside(router as unknown as SurfaceRouter);
}

/** The persistent mount, beside <main> on every page: takes no room until the surface renders something in it. */
export function SurfacePersistent() {
  return (
    <ReportingBoundary name="surface-persistent" fallback={() => null}>
      <PersistentMount />
    </ReportingBoundary>
  );
}
