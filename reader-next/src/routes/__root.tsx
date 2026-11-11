/// <reference types="vite/client" />
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useLocation, useMatches, useRouter } from "@tanstack/react-router";
import { type QueryClient } from "@tanstack/react-query";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { parseCookieHeader, parseCookieSettings, type ReaderSettings } from "~/lib/reader/settings";
import { LinkProvider } from "~/ui/Link/Link";
import { RouterLink } from "~/features/shared/RouterLink";
import { ReaderSettingsProvider } from "~/features/reader/settings-context";
import { ReaderStateProvider } from "~/features/reader-state/ReaderStateProvider";
import { isReaderPath } from "~/lib/reader/paths";
import { isStandalonePage } from "~/lib/routing/standalone";
import { markLoadEntry } from "~/lib/routing/load-entry";
import { isNotFoundMatch, prefsOfForcedNotFound, throwIfForcedNotFound } from "~/lib/routing/not-found";
import { SiteHostProvider } from "~/lib/routing/library-href";
import { NotFoundPage } from "~/features/routing/NotFoundPage";
import { notFoundTitle, type TitleLang } from "~/lib/reader/page-title";
import { forgetTopicSortOff } from "~/lib/topics/topic-sort-carry";
import { useHeaderSearch } from "~/features/shell/useHeaderSearch";
import { SiteHeader } from "~/ui/SiteHeader/SiteHeader";
import { setMobileMenuOpen, useMobileMenuOpen } from "~/features/shell/mobile-menu";
import { SkipLink } from "~/ui/SkipLink/SkipLink";
import { siteHeadLinks, siteHeadMeta } from "~/lib/shell/site-head";
import { CookieNotice } from "~/ui/CookieNotice/CookieNotice";
import { BannerImpressionProbe } from "~/features/shell/BannerImpressionProbe";
import { Monitoring } from "~/features/shell/Monitoring";
import { useReaderOptIn } from "~/features/shell/ReaderChoice";
import { ReportingBoundary } from "~/lib/monitoring/ErrorBoundary";
import { RouteError } from "~/features/shared/RouteError";
import { openAssistantFromHeader, useAssistantShown } from "~/features/shell/assistant-pill";
import { LibraryAssistant } from "~/features/assistant/LibraryAssistant";
import { installLegacyEvents } from "~/lib/integration/legacy-events";
import { remoteConfigQueryOptions } from "~/lib/shell/remote-config";
import { useViewer, viewerQuery } from "~/features/auth/viewer";
import { installSignupSourceCapture } from "~/features/auth/signup-source";
import { useGoogleOneTap } from "~/features/auth/use-google-one-tap";
import { resumePendingAuthAttempt } from "~/lib/auth/analytics";
import { loadGoogleIdentity } from "~/lib/auth/sdk";
import { SSO_CONFIG } from "~/lib/config";
import { collectGarbage, persistHydrated } from "~/lib/cache/persisters";
import appCss from "~/features/shell/App.module.css";
import tokens from "~/ui/tokens/tokens.css?url";
import fonts from "~/ui/tokens/fonts.css?url";
import base from "~/ui/tokens/base.css?url";
import { configScript, PUBLIC_CONFIG } from "~/lib/config";
import { analyticsHeadScripts, attachDeclarativeAnalytics, saMetadataScript, searchFlow, simpleAnalyticsScript, useAppAnalytics } from "~/lib/analytics";
import { GARAMOND_FILES, TYPEKIT_CSS } from "~/lib/fonts/typekit";
import robotoLatin from "@fontsource/roboto/files/roboto-latin-400-normal.woff2?url";
import heeboHebrewBold from "@fontsource/heebo/files/heebo-hebrew-700-normal.woff2?url";
// Hebrew verse numbers (and the Hebrew interface) are Heebo 400: on screen at first paint
import heeboHebrew from "@fontsource/heebo/files/heebo-hebrew-400-normal.woff2?url";

/** Reader settings and interface language from a cookie string (same names as the old site); `diaspora` as decided for this visit. */
const prefsFromCookies = (header: string, diaspora: boolean, host?: string) => {
  const cookies = parseCookieHeader(header);
  return {
    settings: parseCookieSettings(cookies),
    interfaceLang: cookies.interfaceLang === "hebrew" ? ("hebrew" as const) : ("english" as const),
    diaspora,
    /** The host the page was asked for (links to Library pages stay on the Library host from a Voices page: lib/routing/library-href.ts). */
    host,
  };
};
type RootPrefs = ReturnType<typeof prefsFromCookies>;
/**
 * The old LocationSettingsMiddleware: a reader in Israel (Cloudflare's cf-ipcountry "IL") is not in the diaspora; an unknown country
 * ("XX" or none) is PINNED_IPCOUNTRY, else the diaspora.
 */
export function diasporaFor(country: string | undefined, pinned = typeof process !== "undefined" ? process.env.PINNED_IPCOUNTRY : undefined): boolean {
  const c = (!country || country.toUpperCase() === "XX" ? pinned || "us" : country).toLowerCase();
  return c !== "il";
}
/** On the server: from the request. */
const getRequestPrefs = createServerFn({ method: "GET" }).handler(async () =>
  prefsFromCookies(getRequestHeader("cookie") ?? "", diasporaFor(getRequestHeader("cf-ipcountry")), getRequestHeader("x-forwarded-host")?.split(",")[0]?.trim() || getRequestHeader("host") || undefined),
);
/** In the browser: what the server decided for this page (written into it by RootDocument). */
const pageDiaspora = () => (window as unknown as { __SEFARIA_REQUEST__?: { diaspora?: boolean } }).__SEFARIA_REQUEST__?.diaspora ?? true;

/** The interface language in head(): the root's context, or the preferences the forced not-found carries. */
function headLang(matches: readonly { context?: unknown; error?: unknown }[]): TitleLang {
  const root = matches[0];
  const fromCtx = (root?.context as Partial<RootPrefs> | undefined)?.interfaceLang;
  return fromCtx ?? (prefsOfForcedNotFound(root?.error) as Partial<RootPrefs> | null)?.interfaceLang ?? "english";
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Every navigation runs this: in the browser the cookies are right here (a server function was an HTTP round trip per navigation,
  // scroll-driven address updates included)
  beforeLoad: async (opts): Promise<RootPrefs> => {
    const prefs = typeof document === "undefined" ? await getRequestPrefs() : prefsFromCookies(document.cookie, pageDiaspora(), window.location.host);
    // Neither this client nor Django has a page here: the server asks for the reader's own 404 page (src/lib/routing/not-found.ts).
    // Thrown from beforeLoad so no page loader runs (none can fetch, or redirect instead of the 404); the reader's language rides on
    // the not-found's data and the signed-in reader is loaded first, so the 404 page is drawn in their language with their header.
    await throwIfForcedNotFound(opts, prefs, () =>
      Promise.all([opts.context.queryClient.ensureQueryData(viewerQuery).catch(() => null), opts.context.queryClient.ensureQueryData(remoteConfigQueryOptions()).catch(() => undefined)]),
    );
    return prefs;
  },
  // who is signed in, in the first paint (the query forwards the request's cookie on the server: src/features/auth/viewer.ts)
  // and the remote-config switches (the promo banner is in the first paint, so it cannot push the page down later)
  loader: async ({ context }) => {
    const [viewer] = await Promise.all([context.queryClient.ensureQueryData(viewerQuery), context.queryClient.ensureQueryData(remoteConfigQueryOptions()).catch(() => undefined)]);
    return { viewer };
  },
  notFoundComponent: NotFoundPage,
  head: ({ matches }) => {
    // a standalone page (compare.html) has no viewport meta and loads no site fonts: the browser's own Times, laid out 980px wide on a phone
    if (isStandalonePage(matches[matches.length - 1]?.pathname ?? "")) return { meta: [{ charSet: "utf-8" }, { title: "Sefaria Reader" }], links: [{ rel: "stylesheet", href: tokens }, { rel: "stylesheet", href: base }] };
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // a page nobody has (the reader's 404, T-F28): titled as the old site's 404 and kept out of search engines
      // in the reader's interface language, as Django's 404 page ("הדף שביקשתם איננו נמצא | ספריא")
      ...(matches.some(isNotFoundMatch) ? [{ title: notFoundTitle(headLang(matches)) }, { name: "robots", content: "noindex" }] : [{ title: "Sefaria Reader" }]),
    ],
    links: [
      // The faces on screen at first paint, preloaded with the page: a face that arrives later reflows the
      // text under the reader (see TXD-054). Everything else in fonts.css loads on demand.
      ...[robotoLatin, heeboHebrew, heeboHebrewBold].map((href) => ({ rel: "preload", href, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const })),
      // Adobe Garamond Pro (English text) from the old site's own Adobe Fonts kit: its stylesheet, and the files on screen at first paint
      { rel: "preconnect", href: "https://use.typekit.net", crossOrigin: "anonymous" as const },
      ...[GARAMOND_FILES.regular, GARAMOND_FILES.italic, GARAMOND_FILES.bold].map((href) => ({ rel: "preload", href, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const })),
      { rel: "stylesheet", href: TYPEKIT_CSS },
      { rel: "preload", href: "/fonts/Taamey-Frank/TaameyFrankCLM-Medium.ttf", as: "font", type: "font/ttf", crossOrigin: "anonymous" },
      // Talmud's bold opening words are Taamey Frank Bold: arriving late it would re-wrap the text under the reader
      { rel: "preload", href: "/fonts/Taamey-Frank/TaameyFrankCLM-Bold.ttf", as: "font", type: "font/ttf", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: fonts },
      { rel: "stylesheet", href: tokens },
      { rel: "stylesheet", href: base },
    ],
    };
  },
  component: RootComponent,
});

/**
 * The root's preferences: its context — or, when the server asked for the 404 page (the root threw notFound before returning a
 * context), the same preferences carried on that not-found's data.
 */
function useRootPrefs(): RootPrefs {
  const ctx = Route.useRouteContext() as Partial<RootPrefs>;
  const error = Route.useMatch({ select: (m) => m.error });
  return (ctx.interfaceLang ? ctx : (prefsOfForcedNotFound(error) as RootPrefs | null) ?? prefsFromCookies("", true)) as RootPrefs;
}

function RootComponent() {
  const { interfaceLang, settings, host } = useRootPrefs();
  // the entry the browser loaded, noted before any page's effect runs (src/lib/routing/load-entry.ts)
  const router = useRouter();
  useState(() => markLoadEntry(router.history.location.state));
  // Lets tests (and anything else that must wait for interactivity) know React has attached its handlers.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  // a page sefaria.org serves outside the site's frame (the version-diff tool) is rendered bare, as there (src/lib/routing/standalone.ts)
  const pathname = useLocation().pathname;
  const standalone = isStandalonePage(pathname);
  // the topic panel's sort lasts only while the reader moves from topic to topic (src/lib/topics/topic-sort-carry.ts)
  useEffect(() => forgetTopicSortOff(pathname), [pathname]);
  return (
    <RootDocument lang={interfaceLang === "hebrew" ? "he" : "en"} dir={standalone ? undefined : interfaceLang === "hebrew" ? "rtl" : "ltr"} standalone={standalone}>
      <SiteHostProvider value={host}>
      <InterfaceLangProvider lang={interfaceLang}>
        <LinkProvider value={RouterLink}>
          <ReaderStateProvider>
            <ReaderSettingsProvider initial={settings}>
              {standalone ? <Outlet /> : (
                // a render error outside a route's own boundary (the header, the shell) is reported and shows the error page
                <ReportingBoundary name="root" resetKey={pathname} fallback={(error) => <RouteError error={error} reported />}>
                  <Shell />
                </ReportingBoundary>
              )}
            </ReaderSettingsProvider>
          </ReaderStateProvider>
        </LinkProvider>
      </InterfaceLangProvider>
      </SiteHostProvider>
    </RootDocument>
  );
}

/**
 * The page around every route: skip link, header, the main landmark, cookie notice. While reading on a phone the header
 * gives way to the panel's own controls, as on the old site (GUI-002).
 */
function Shell() {
  const loc = useLocation();
  // a book's own page is a library page: it keeps the site header on a phone (a text hides it, the panel has its own)
  const matches = useMatches();
  const book = (matches.find((m) => m.routeId === "/$")?.loaderData as { kind?: string } | undefined)?.kind === "book";
  // the not-found page is a site page, not a text (the header stays on a phone)
  const reading = isReaderPath(loc.pathname) && !book && !matches.some(isNotFoundMatch);
  const search = useHeaderSearch();
  const menuOpen = useMobileMenuOpen();
  const viewer = useViewer();
  // visitor marking and once-per-session events (the old ReaderApp mount)
  useAppAnalytics(!!viewer);
  // sign-in plumbing of the old ReaderApp: close out an SSO redirect's funnel attempt, remember which control started a sign-up,
  // and (signed out, a Google client configured) load Google Identity Services for One Tap, as the old base.html did
  useEffect(() => {
    resumePendingAuthAttempt();
    installSignupSourceCapture();
  }, []);
  useEffect(() => {
    if (!viewer && SSO_CONFIG.googleClientId) loadGoogleIdentity();
  }, [viewer]);
  useGoogleOneTap({ googleClientId: SSO_CONFIG.googleClientId, enabled: !viewer });
  // going somewhere closes the phone menu
  useEffect(() => setMobileMenuOpen(false), [loc.pathname]);
  // data-anl-* declarations anywhere in the page (the old attach("#s2, #staticContentWrapper", …))
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => (appRef.current ? attachDeclarativeAnalytics(appRef.current) : undefined), []);
  // Keep the disk cache bounded: once per visit, well after the page has settled, when the browser is idle
  const queryClient = useRouter().options.context.queryClient as QueryClient;
  useEffect(() => {
    // what the server rendered goes to disk too (R-20), once the browser is idle after hydration
    const idle = (fn: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 5_000 }) : setTimeout(fn, 1_000));
    idle(() => void persistHydrated(queryClient).catch(() => undefined));
  }, [queryClient]);
  useEffect(() => {
    const t = setTimeout(() => {
      const run = () => void collectGarbage().catch(() => undefined);
      if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 10_000 });
      else run();
    }, 15_000);
    return () => clearTimeout(t);
  }, []);
  // back / forward into the search page starts its funnel with source "back_click" (the old handlePopState)
  const router = useRouter();
  useEffect(
    () =>
      router.history.subscribe(({ location, action }) => {
        if (action.type !== "PUSH" && action.type !== "REPLACE" && location.pathname === "/search") searchFlow.setNextFlowSource("back_click");
      }),
    [router],
  );
  // what other apps on the page ask of the reader — the Library Assistant's links above all (src/lib/integration): a page of
  // this client is a navigation in the app, a page Django serves is loaded in full
  useEffect(
    () =>
      installLegacyEvents(document, {
        navigate: (to, { replace }) => void router.navigate({ href: `${to.pathname}${to.search}${to.hash}`, replace }),
        load: (href, { replace }) => (replace ? window.location.replace(href) : window.location.assign(href)),
        refreshReader: () => void queryClient.invalidateQueries({ queryKey: ["user"] }),
      }),
    [router, queryClient],
  );
  // the "✦ Library Assistant" pill, while the widget is on the page (sefaria.org #3934 replaced the stand-alone promo banner with it)
  const assistantShown = useAssistantShown();
  // "Back to the classic reader" / "Report a problem" while the reader has opted in (src/features/shell/ReaderChoice.tsx)
  const optIn = useReaderOptIn(viewer);
  return (
    <div ref={appRef} className={appCss.app} data-reading={reading ? "true" : undefined} data-menu={menuOpen ? "open" : undefined}>
      <SkipLink />
      <div className={appCss.header}>
        <SiteHeader next={loc.pathname + (loc.searchStr ?? "")} search={search} viewer={viewer} menuOpen={menuOpen} onMenuOpenChange={setMobileMenuOpen} optIn={optIn.actions} onOpenAssistant={assistantShown ? openAssistantFromHeader : undefined} />
      </div>
      <main id="main" className={appCss.main} tabIndex={-1} data-scroll-restoration-id="main">
        <Outlet />
      </main>
      <LibraryAssistant search={loc.searchStr ?? ""} />
      <CookieNotice />
      <BannerImpressionProbe />
      {optIn.dialog}
      <Monitoring signedIn={!!viewer} />
    </div>
  );
}

const simpleAnalytics = simpleAnalyticsScript(PUBLIC_CONFIG.analytics);

function RootDocument({ children, lang, dir, standalone }: Readonly<{ children: ReactNode; lang: string; dir?: string; standalone?: boolean }>) {
  // On the forced 404 the root loader does not run; the viewer beforeLoad put in the query cache is the same answer (signed-in
  // readers were reported as signed out on 404 pages)
  const cachedViewer = useViewer();
  const viewer = Route.useLoaderData()?.viewer ?? cachedViewer;
  const { interfaceLang, diaspora } = useRootPrefs();
  const saMetadata = saMetadataScript(PUBLIC_CONFIG.analytics, { loggedIn: !!viewer, staff: !!viewer?.email?.includes("sefaria.org") });
  // The runtime config (before any module runs: src/lib/config.ts), then the analytics vendors, each only when configured. Plain
  // <script> tags here run once per document; the router's head() would re-inject them on every navigation.
  // a standalone page (compare.html) loads Google Tag Manager only
  const headScripts = [{ children: configScript() }, { children: `window.__SEFARIA_REQUEST__=${JSON.stringify({ diaspora: diaspora !== false })};` }, ...analyticsHeadScripts(standalone ? { ...PUBLIC_CONFIG.analytics, gtag: null, simpleAnalyticsHost: null } : PUBLIC_CONFIG.analytics, interfaceLang ?? "english", viewer ? { uid: viewer.id, email: viewer.email } : null)];
  return (
    // Pinned light: with no theme the tokens follow the OS, but ~200 literal colours do not, so dark-OS readers got a
    // half-dark page. Dark mode arrives behind its remote-config flag once every colour is a token.
    <html lang={lang} dir={dir} data-theme="light">
      <head>
        {headScripts.map(({ children: code, ...attrs }, i) => (code ? <script key={i} {...attrs} dangerouslySetInnerHTML={{ __html: code }} /> : <script key={i} {...attrs} />))}
        {/* base.html's static links and meta (src/lib/shell/site-head.ts): plain tags, once per document. Declared in head() they were
            re-rendered on every address update while reading, which slowed long reads (e2e/scroll.spec.ts 'reading far forward'). */}
        {standalone ? null : siteHeadMeta(interfaceLang === "hebrew").map((m) => <meta key={m.name} {...m} />)}
        {standalone ? null : siteHeadLinks().map((l) => <link key={`${l.rel}${l.type ?? ""}`} {...l} />)}
        <HeadContent />
      </head>
      <body data-standalone={standalone ? "" : undefined}>
        {children}
        <Scripts />
        {saMetadata && !standalone ? <script dangerouslySetInnerHTML={{ __html: saMetadata }} /> : null}
        {simpleAnalytics && !standalone ? <script {...simpleAnalytics} /> : null}
      </body>
    </html>
  );
}

export type { ReaderSettings };
