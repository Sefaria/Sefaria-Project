/**
 * Where the social surface sits in the page (contract/surface-host.v1.ts): the page mount under /social/* (src/routes/social.*, a
 * route chunk) and the persistent mount beside <main> on every page (src/routes/__root.tsx loads it lazily, after hydration:
 * ./SurfacePersistentSlot.tsx), both only while the `social` lab is on, so a reader without the lab downloads none of this. Each renders an empty
 * element of its own, loads the surface in the browser (src/lib/surfaces/load.ts, shared by both mounts) and hands it the element and
 * the SurfaceHost. Nothing the surface does can break the reader: a failed load, a mount that throws or a render error inside this
 * component is reported and leaves an empty element.
 *
 * @feature SHL-076 Social lab and /social routes
 * @feature SHL-077 Surface loader
 * @feature SHL-078 SurfaceHost v1
 */
import { useEffect, useRef, useState } from "react";
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
import { getSurface } from "~/lib/surfaces/load";
import { socialEnvForPage } from "~/lib/surfaces/version";
import { createIdentityTokenSource } from "~/lib/surfaces/identity";
import { createSurfaceHost, type SurfaceRouter, type UiState } from "~/lib/surfaces/host";
import { viewerQuery } from "~/features/auth/viewer";
import { useReaderSettings } from "~/features/reader/settings-context";
import { useReaderState } from "~/features/reader-state/context";
import type { SurfaceHost } from "../../../contract/surface-host.v1";
import styles from "./SurfaceMount.module.css";

type HostFactory = (version: string) => SurfaceHost;

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
    const factory: HostFactory = (version) =>
      createSurfaceHost({
        router: router as unknown as SurfaceRouter,
        state: readerState.api,
        commands,
        viewer,
        identityToken,
        requestSignIn: () => {
          const l = router.history.location;
          void router.navigate({ href: withNext("/login", `${l.pathname}${l.search}${l.hash}`) });
        },
        ui,
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

function Mount({ kind }: { kind: "page" | "persistent" }) {
  const el = useRef<HTMLDivElement>(null);
  const hostFor = useHostFactory();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!hostFor || !el.current) return;
    const target = el.current;
    let unmount: (() => void) | undefined;
    let gone = false;
    getSurface(socialEnvForPage(PUBLIC_CONFIG.social), router.history.location.pathname).then(
      ({ surface, version }) => {
        if (gone) return;
        try {
          const fn = kind === "page" ? surface.mountPage(target, hostFor(version)) : surface.mountPersistent(target, hostFor(version));
          unmount = typeof fn === "function" ? fn : undefined;
          target.dataset.surfaceState = "mounted";
        } catch (e) {
          reportError("boundary", e, { boundary: `surface:social@${version}:${kind}` });
          target.replaceChildren();
          setFailed(true);
        }
      },
      (e: unknown) => {
        if (gone) return;
        // reported once per load (both mounts share it): the page mount reports, the persistent one stays quiet
        if (kind === "page" || !document.querySelector("[data-surface-mount=page]")) reportError("boundary", e, { boundary: "surface:social:load" });
        setFailed(true);
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
  }, [hostFor, kind, router]);
  return <div ref={el} className={kind === "page" ? styles.page : styles.persistent} data-surface-mount={kind} data-surface-state={failed ? "failed" : undefined} />;
}

/** The page mount: an empty, sized element (no layout shift when the surface fills it) under /social/*. */
export function SurfacePage() {
  return (
    <ReportingBoundary name="surface-page" fallback={() => <div className={styles.page} data-surface-mount="page" data-surface-state="failed" />}>
      <Mount kind="page" />
    </ReportingBoundary>
  );
}

/** The persistent mount, beside <main> on every page: takes no room until the surface renders something in it. */
export function SurfacePersistent() {
  return (
    <ReportingBoundary name="surface-persistent" fallback={() => null}>
      <Mount kind="persistent" />
    </ReportingBoundary>
  );
}
