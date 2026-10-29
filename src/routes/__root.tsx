/// <reference types="vite/client" />
import { useEffect, useRef, type ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useLocation, useMatches, useRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { InterfaceLangProvider } from "~/lib/i18n/interface-lang";
import { parseCookieHeader, parseCookieSettings, type ReaderSettings } from "~/lib/reader/settings";
import { LinkProvider } from "~/ui/Link/Link";
import { RouterLink } from "~/features/shared/RouterLink";
import { ReaderSettingsProvider } from "~/features/reader/settings-context";
import { isReaderPath } from "~/lib/reader/paths";
import { useHeaderSearch } from "~/features/shell/useHeaderSearch";
import { SiteHeader } from "~/ui/SiteHeader/SiteHeader";
import { setMobileMenuOpen, useMobileMenuOpen } from "~/features/shell/mobile-menu";
import { SkipLink } from "~/ui/SkipLink/SkipLink";
import { CookieNotice } from "~/ui/CookieNotice/CookieNotice";
import { BannerImpressionProbe } from "~/features/shell/BannerImpressionProbe";
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
import { analyticsHeadScripts, attachDeclarativeAnalytics, initSentry, saMetadataScript, searchFlow, simpleAnalyticsScript, useAppAnalytics } from "~/lib/analytics";
import { GARAMOND_FILES, TYPEKIT_CSS } from "~/lib/fonts/typekit";
import robotoLatin from "@fontsource/roboto/files/roboto-latin-400-normal.woff2?url";
import heeboHebrewBold from "@fontsource/heebo/files/heebo-hebrew-700-normal.woff2?url";

/** Reader settings and interface language from a cookie string (same names as the old site); `diaspora` as decided for this visit. */
const prefsFromCookies = (header: string, diaspora: boolean) => {
  const cookies = parseCookieHeader(header);
  return {
    settings: parseCookieSettings(cookies),
    interfaceLang: cookies.interfaceLang === "hebrew" ? ("hebrew" as const) : ("english" as const),
    diaspora,
  };
};
/**
 * The old LocationSettingsMiddleware: a reader in Israel (Cloudflare's cf-ipcountry "IL") is not in the diaspora; an unknown country
 * ("XX" or none) is PINNED_IPCOUNTRY, else the diaspora (CODE_REVIEW R-21).
 */
export function diasporaFor(country: string | undefined, pinned = typeof process !== "undefined" ? process.env.PINNED_IPCOUNTRY : undefined): boolean {
  const c = (!country || country.toUpperCase() === "XX" ? pinned || "us" : country).toLowerCase();
  return c !== "il";
}
/** On the server: from the request. */
const getRequestPrefs = createServerFn({ method: "GET" }).handler(async () => prefsFromCookies(getRequestHeader("cookie") ?? "", diasporaFor(getRequestHeader("cf-ipcountry"))));
/** In the browser: what the server decided for this page (written into it by RootDocument). */
const pageDiaspora = () => (window as unknown as { __SEFARIA_REQUEST__?: { diaspora?: boolean } }).__SEFARIA_REQUEST__?.diaspora ?? true;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Every navigation runs this: in the browser the cookies are right here (a server function was an HTTP round trip per navigation,
  // scroll-driven address updates included: CODE_REVIEW R-09)
  beforeLoad: async () => (typeof document === "undefined" ? getRequestPrefs() : prefsFromCookies(document.cookie, pageDiaspora())),
  // who is signed in, in the first paint (the query forwards the request's cookie on the server: src/features/auth/viewer.ts)
  loader: ({ context }) => context.queryClient.ensureQueryData(viewerQuery).then((viewer) => ({ viewer })),
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Sefaria Reader" }],
    links: [
      // The faces on screen at first paint, preloaded with the page: a face that arrives later reflows the
      // text under the reader (see TXD-054). Everything else in fonts.css loads on demand.
      ...[robotoLatin, heeboHebrewBold].map((href) => ({ rel: "preload", href, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const })),
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
  }),
  component: RootComponent,
});

function RootComponent() {
  const { interfaceLang, settings } = Route.useRouteContext();
  // Lets tests (and anything else that must wait for interactivity) know React has attached its handlers.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
    void initSentry();
  }, []);
  return (
    <RootDocument lang={interfaceLang === "hebrew" ? "he" : "en"} dir={interfaceLang === "hebrew" ? "rtl" : "ltr"}>
      <InterfaceLangProvider lang={interfaceLang}>
        <LinkProvider value={RouterLink}>
          <ReaderSettingsProvider initial={settings}>
            <Shell />
          </ReaderSettingsProvider>
        </LinkProvider>
      </InterfaceLangProvider>
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
  const reading = isReaderPath(loc.pathname) && !book;
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
  // Keep the disk cache bounded (CODE_REVIEW R-11): once per visit, well after the page has settled, when the browser is idle
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
  return (
    <div ref={appRef} className={appCss.app} data-reading={reading ? "true" : undefined} data-menu={menuOpen ? "open" : undefined}>
      <SkipLink />
      <div className={appCss.header}>
        <SiteHeader next={loc.pathname + (loc.searchStr ?? "")} search={search} viewer={viewer} menuOpen={menuOpen} onMenuOpenChange={setMobileMenuOpen} />
      </div>
      <main id="main" className={appCss.main} tabIndex={-1}>
        <Outlet />
      </main>
      <CookieNotice />
      <BannerImpressionProbe />
    </div>
  );
}

const simpleAnalytics = simpleAnalyticsScript(PUBLIC_CONFIG.analytics);

function RootDocument({ children, lang, dir }: Readonly<{ children: ReactNode; lang: string; dir: string }>) {
  const viewer = Route.useLoaderData()?.viewer;
  const { interfaceLang, diaspora } = Route.useRouteContext();
  const saMetadata = saMetadataScript(PUBLIC_CONFIG.analytics, { loggedIn: !!viewer, staff: !!viewer?.email?.includes("sefaria.org") });
  // The runtime config (before any module runs: src/lib/config.ts), then the analytics vendors, each only when configured. Plain
  // <script> tags here run once per document; the router's head() would re-inject them on every navigation (CODE_REVIEW R-01).
  const headScripts = [{ children: configScript() }, { children: `window.__SEFARIA_REQUEST__=${JSON.stringify({ diaspora: diaspora !== false })};` }, ...analyticsHeadScripts(PUBLIC_CONFIG.analytics, interfaceLang ?? "english", viewer ? { uid: viewer.id, email: viewer.email } : null)];
  return (
    // Pinned light (CODE_REVIEW R-06): with no theme the tokens follow the OS, but ~200 literal colours do not, so dark-OS readers got a
    // half-dark page. Dark mode arrives behind its remote-config flag once every colour is a token (TARGET_ARCHITECTURE §6.6).
    <html lang={lang} dir={dir} data-theme="light">
      <head>
        {headScripts.map(({ children: code, ...attrs }, i) => (code ? <script key={i} {...attrs} dangerouslySetInnerHTML={{ __html: code }} /> : <script key={i} {...attrs} />))}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        {saMetadata ? <script dangerouslySetInnerHTML={{ __html: saMetadata }} /> : null}
        {simpleAnalytics ? <script {...simpleAnalytics} /> : null}
      </body>
    </html>
  );
}

export type { ReaderSettings };
