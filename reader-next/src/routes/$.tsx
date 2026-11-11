import { createFileRoute, redirect } from "@tanstack/react-router";
import { loadWorkspaceRoute } from "~/features/reader/reader-route";
// Each page kind (the reader, a book's page) is its own chunk, loaded before anything renders: see page-kinds.tsx (T-H03)
import { loadPageKind, PAGE_KIND_META, preloadRenderedPageKind, ReaderRoute as PageKindRoute, type PageData } from "~/features/reader/page-kinds";
import { loadBookRoute } from "~/features/book/book-route";
import { bookMeta, pageUrls } from "~/lib/library/page-head";
import { CANONICAL_ORIGIN } from "~/lib/config";
import { hebrewSiteOrigin } from "~/lib/routing/site-origins";
import { pageCanonicalOrigin } from "~/lib/routing/canonical";
import { decodeVtitle, encodeVtitle, validateReaderSearch, type ReaderSearch } from "~/lib/reader/url-state";
import type { VersionMeta } from "~/lib/text/model";
import { versionsQueryOptions } from "~/lib/versions/book-versions";
import { refToUrl, urlToRef } from "~/lib/ref/url";
import { ErrorState } from "~/ui/Feedback/Feedback";
// each page kind's stylesheets, linked in the server-rendered head (vite-plugins/page-kind-css.ts, v-exits F-2)
import pageKindCss from "virtual:page-kind-css";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";
import { notFoundTitle, readerPageTitle, type TitleLang } from "~/lib/reader/page-title";
import { decodeWorkspace, type RawSearch } from "~/lib/workspace/url";
import { panelOrder } from "~/lib/workspace/ops";
import { buildCatalog, type Catalog, type TocNode } from "~/lib/catalog/toc";
import { categoryLabel } from "~/lib/connections/terms";
import type { QueryClient } from "@tanstack/react-query";

/**
 * The old address for a text in one version, `/<ref>/<lang>/<version>` (Django's `old_versions_redirect`, sefaria/urls_shared.py):
 * a 301 to `/<ref>?v<lang>=<version>` with the request's own query after it. A title that itself contains
 * "/<two letters>/" would be read the same way; Django checks the joined string against its catalog first, and no such title exists.
 */
export function oldVersionsRedirect(splat: string): { ref: string; lang: string; version: string } | null {
  const m = /^([^/]+)\/(en|he)\/(.+)$/.exec(splat);
  return m ? { ref: m[1]!, lang: m[2]!, version: m[3]! } : null;
}

/** Which text each panel shows (refs and versions). Display state (with, lang, aliyot) does not reload. */
function textDeps(search: ReaderSearch) {
  const deps: Record<string, string | undefined> = { ven: search.ven, vhe: search.vhe };
  for (const [k, v] of Object.entries(search)) if (/^(p|ven|vhe)\d+$/.test(k)) deps[k] = String(v);
  return deps;
}

/**
 * A sidebar filter's Hebrew name for the page title ("Rashi" → רש"י, "Commentary" → מפרשים), from the catalog when it is in memory
 * (the sidebar loads it); undefined otherwise, and the title keeps the name as written, as the old client did for a name it lacked.
 */
const catalogs = new WeakMap<TocNode[], Catalog>();
function hebrewFilterName(queryClient: QueryClient | undefined): (name: string) => string | undefined {
  return (name) => {
    const tree = queryClient?.getQueryData<TocNode[]>(["catalog", "toc"]);
    const catalog = tree ? (catalogs.get(tree) ?? catalogs.set(tree, buildCatalog(tree)).get(tree)) : undefined;
    const category = categoryLabel(name, catalog).he;
    if (category !== name) return category;
    const book = catalog?.books.get(name)?.heTitle;
    if (book) return book;
    for (const b of catalog?.books.values() ?? []) if (b.collectiveTitle === name && b.heCollectiveTitle) return b.heCollectiveTitle;
    return undefined;
  };
}

/**
 * Every ref URL ("/Genesis.1.1", "/Berakhot.2a", "/Rashi_on_Genesis.1.1.1") is the reader, with any further
 * panels in the query (p2=…, docs/WORKSPACE.md).
 */
export const Route = createFileRoute("/$")({
  validateSearch: validateReaderSearch,
  loaderDeps: ({ search }) => textDeps(search),
  loader: async ({ context, params, deps, location }) => {
    const splat = params._splat ?? "";
    const old = oldVersionsRedirect(splat);
    if (old) {
      // the old form names a version by title only; this reader's `ven`/`vhe` carry its language family too (`english|Title`), which
      // the versions of the ref say (sefaria.org's client fills it in the same way after the redirect)
      const title = decodeVtitle(old.version);
      // only for a ref the server knows (junk under this shape is left to the not-found page, not sent on with a 301)
      const versions = await context.queryClient.fetchQuery(versionsQueryOptions(urlToRef(old.ref))).catch(() => null as VersionMeta[] | null);
      if (versions?.length) {
        const family = versions.find((v) => v.versionTitle === title)?.languageFamilyName ?? (old.lang === "he" ? "hebrew" : "english");
        throw redirect({ to: "/$", params: { _splat: old.ref }, search: { ...(location.search as Record<string, unknown>), [`v${old.lang}`]: `${family}|${encodeVtitle(title)}` } as never, statusCode: 301 });
      }
    }
    // `/Genesis` (a book, no section) is the book's page; anything with a section or a node is the reader
    const book = !Object.keys(deps).some((k) => /^p\d+$/.test(k)) ? await loadBookRoute(context.queryClient, splat, location.searchStr ?? "") : null;
    if (book) {
      await loadPageKind("book"); // the page's code is in before it renders (no Suspense boundary: page-kinds.tsx)
      return { kind: "book" as const, ...book, interfaceLang: context.interfaceLang, urls: pageUrls(location.href, await pageCanonicalOrigin(), { english: CANONICAL_ORIGIN, hebrew: hebrewSiteOrigin(CANONICAL_ORIGIN) }) };
    }
    const [text] = await Promise.all([loadWorkspaceRoute({ queryClient: context.queryClient, splat, search: deps as ReaderSearch, fullSearch: location.search as ReaderSearch }), loadPageKind("text")]);
    return { kind: "text" as const, ...text, interfaceLang: context.interfaceLang };
  },
  head: ({ loaderData, match }) => {
    // which kind the server rendered, for the hydrating client to load that kind's code first (page-kinds.tsx)
    const kindMeta = loaderData ? [{ name: PAGE_KIND_META, content: loaderData.kind }] : [];
    // the kind's own CSS is in the first paint, not only once its JS chunk arrives (an unstyled reader shifted by 0.4 at hydration)
    const kindCss = loaderData ? (pageKindCss[loaderData.kind] ?? []).map((href) => ({ rel: "stylesheet", href })) : [];
    if (loaderData?.kind === "book") return { meta: [...bookMeta(loaderData, loaderData.interfaceLang), ...loaderData.urls.meta, ...kindMeta], links: [...kindCss, ...loaderData.urls.links] };
    const ctx = match.context as { interfaceLang?: TitleLang; queryClient?: QueryClient };
    const lang: TitleLang = (loaderData?.kind === "text" ? loaderData.interfaceLang : undefined) ?? ctx.interfaceLang ?? "english";
    const panels = loaderData && loaderData.kind === "text" ? Object.values(loaderData.panels) : [];
    const first = panels[0];
    // the old client's title (src/lib/reader/page-title.ts): each panel's ref, "with" its sidebar's source, in the interface's language;
    // no text (the not-found page) is titled as Django's 404
    let title = notFoundTitle(lang);
    if (loaderData?.kind === "text") {
      const ws = decodeWorkspace(urlToRef(match.params._splat ?? ""), match.search as RawSearch);
      const titled = panelOrder(loaderData.workspace).flatMap((id) => {
        const p = loaderData.panels[id];
        return p ? [{ ref: p.ref, heRef: p.heRef, view: ws.panels[id]?.asides[0]?.view }] : [];
      });
      title = readerPageTitle(titled, lang, hebrewFilterName(ctx.queryClient));
    }
    return {
      meta: [{ title }, ...kindMeta],
      links: [
        ...kindCss,
        ...(first?.prev ? [{ rel: "prev", href: `/${refToUrl(first.prev)}` }] : []),
        ...(first?.next ? [{ rel: "next", href: `/${refToUrl(first.next)}` }] : []),
        // The neighbouring sections start downloading with the page, not after hydration. @feature TXD-069
        ...panels.flatMap((p) => p.preload).map((href) => ({ rel: "preload", as: "fetch", href, crossOrigin: "anonymous" as const })),
      ],
    };
  },
  notFoundComponent: () => (
    <ErrorState title={<InterfaceText en="Text not found" he="הטקסט לא נמצא" />}>
      <InterfaceText en="We couldn't find that text. Check the title or try the search." he="לא מצאנו את הטקסט. בדקו את הכותרת או נסו לחפש." />
    </ErrorState>
  ),
  component: ReaderRoute,
  // The component stays in this (always loaded) module, so the router calls its own `preload` while hydrating; the kinds' code is
  // split by page-kinds.tsx instead. The other components keep the default split.
  codeSplitGroupings: [["notFoundComponent"], ["errorComponent"], ["pendingComponent"]],
});

function ReaderRoute() {
  return <PageKindRoute data={Route.useLoaderData() as PageData} />;
}
// awaited by the router before React hydrates the first page (router-core loadRouteChunk → component.preload)
ReaderRoute.preload = preloadRenderedPageKind;
