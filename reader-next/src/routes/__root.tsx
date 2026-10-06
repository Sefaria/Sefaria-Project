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
import appCss from "~/features/shell/App.module.css";
import tokens from "~/ui/tokens/tokens.css?url";
import fonts from "~/ui/tokens/fonts.css?url";
import base from "~/ui/tokens/base.css?url";
import { configScript, PUBLIC_CONFIG } from "~/lib/config";
import { analyticsHeadScripts, attachDeclarativeAnalytics, initSentry, saMetadataScript, searchFlow, simpleAnalyticsScript, useAppAnalytics } from "~/lib/analytics";
import { GARAMOND_FILES, TYPEKIT_CSS } from "~/lib/fonts/typekit";
import robotoLatin from "@fontsource/roboto/files/roboto-latin-400-normal.woff2?url";
import heeboHebrewBold from "@fontsource/heebo/files/heebo-hebrew-700-normal.woff2?url";

/** Reader settings and interface language, read from the request's cookies (same names as the old site). */
const getRequestPrefs = createServerFn({ method: "GET" }).handler(async () => {
  const cookies = parseCookieHeader(getRequestHeader("cookie") ?? "");
  return {
    settings: parseCookieSettings(cookies),
    interfaceLang: cookies.interfaceLang === "hebrew" ? ("hebrew" as const) : ("english" as const),
  };
});

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async () => getRequestPrefs(),
  head: ({ match }) => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Sefaria Reader" }],
    // the runtime config (API and site origins) for the browser, before any module runs: src/lib/config.ts
    // then the analytics vendors, each only when configured (src/lib/analytics/scripts.ts)
    scripts: [{ children: configScript() }, ...analyticsHeadScripts(PUBLIC_CONFIG.analytics, match.context.interfaceLang ?? "english")],
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
  useAppAnalytics(undefined);
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
  // going somewhere closes the phone menu
  useEffect(() => setMobileMenuOpen(false), [loc.pathname]);
  // data-anl-* declarations anywhere in the page (the old attach("#s2, #staticContentWrapper", …))
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => (appRef.current ? attachDeclarativeAnalytics(appRef.current) : undefined), []);
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
        <SiteHeader next={loc.pathname + (loc.searchStr ?? "")} search={search} menuOpen={menuOpen} onMenuOpenChange={setMobileMenuOpen} />
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
const saMetadata = saMetadataScript(PUBLIC_CONFIG.analytics, { loggedIn: false, staff: false });

function RootDocument({ children, lang, dir }: Readonly<{ children: ReactNode; lang: string; dir: string }>) {
  return (
    <html lang={lang} dir={dir}>
      <head>
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
