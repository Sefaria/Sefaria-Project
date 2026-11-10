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
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";

/**
 * The old address for a text in one version, `/<ref>/<lang>/<version>` (Django's `old_versions_redirect`, sefaria/urls_shared.py):
 * a 301 to `/<ref>?v<lang>=<version>` with the request's own query after it (LAUNCH_PLAN T-E08). A title that itself contains
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
    return { kind: "text" as const, ...text };
  },
  head: ({ loaderData, params }) => {
    // which kind the server rendered, for the hydrating client to load that kind's code first (page-kinds.tsx)
    const kindMeta = loaderData ? [{ name: PAGE_KIND_META, content: loaderData.kind }] : [];
    if (loaderData?.kind === "book") return { meta: [...bookMeta(loaderData, loaderData.interfaceLang), ...loaderData.urls.meta, ...kindMeta], links: loaderData.urls.links };
    const panels = loaderData && loaderData.kind === "text" ? Object.values(loaderData.panels) : [];
    const first = panels[0];
    return {
      // Old reader: panel titles joined with "and" (SHL-066).
      meta: [{ title: `${panels.length ? panels.map((p) => p.ref).join(" and ") : urlToRef(params._splat ?? "")} | Sefaria Reader` }, ...kindMeta],
      links: [
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
