import { createFileRoute } from "@tanstack/react-router";
import { loadWorkspaceRoute } from "~/features/reader/reader-route";
import { Workspace } from "~/features/workspace/Workspace";
import { BookRoute } from "~/features/book/BookRoute";
import { loadBookRoute } from "~/features/book/book-route";
import { validateReaderSearch, type ReaderSearch } from "~/lib/reader/url-state";
import { refToUrl, urlToRef } from "~/lib/ref/url";
import { ErrorState } from "~/ui/Feedback/Feedback";
import { InterfaceText } from "~/ui/InterfaceText/InterfaceText";

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
    // `/Genesis` (a book, no section) is the book's page; anything with a section or a node is the reader
    const book = !Object.keys(deps).some((k) => /^p\d+$/.test(k)) ? await loadBookRoute(context.queryClient, splat, location.searchStr ?? "") : null;
    if (book) return { kind: "book" as const, ...book };
    return { kind: "text" as const, ...(await loadWorkspaceRoute({ queryClient: context.queryClient, splat, search: deps as ReaderSearch, fullSearch: location.search as ReaderSearch })) };
  },
  head: ({ loaderData, params }) => {
    if (loaderData?.kind === "book") return { meta: [{ title: `${loaderData.title} | Sefaria Reader` }] };
    const panels = loaderData && loaderData.kind === "text" ? Object.values(loaderData.panels) : [];
    const first = panels[0];
    return {
      // Old reader: panel titles joined with "and" (SHL-066).
      meta: [{ title: `${panels.length ? panels.map((p) => p.ref).join(" and ") : urlToRef(params._splat ?? "")} | Sefaria Reader` }],
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
});

function ReaderRoute() {
  const data = Route.useLoaderData();
  if (data.kind === "book") return <BookRoute title={data.title} />;
  return <Workspace data={data} />;
}
