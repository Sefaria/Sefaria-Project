/**
 * The `$` route renders two kinds of page: the reader (a text) and a book's page. Each kind's code is its own chunk (LAUNCH_PLAN
 * T-H03), and a page never renders before its kind's chunk is in — never behind a Suspense boundary, which is how the two earlier
 * attempts failed (CODE_REVIEW §6):
 *  - typing into a book page's server-rendered dictionary box was lost when the box hydrated late, behind a lazy boundary;
 *  - a lazy boundary that React hid unmounted query observers, which cancelled a fetch a loader was awaiting ("CancelledError").
 *
 * So the chunk is loaded where nothing is rendered yet:
 *  - on a navigation, by the route's loader, before the route renders (`loadPageKind`);
 *  - on the first page, by the router while it hydrates: it awaits the route component's `preload` before React hydrates anything
 *    (`ReaderRoute.preload`, which reads the kind the server rendered from `<meta name="sefaria-page-kind">`).
 */
import type { ComponentType } from "react";
import type { WorkspaceRouteData } from "./reader-route";

export type PageKind = "text" | "book";

type BookComponent = ComponentType<{ title: string }>;
type TextComponent = ComponentType<{ data: WorkspaceRouteData }>;

const loaded: { book?: BookComponent; text?: TextComponent } = {};
const loading: Partial<Record<PageKind, Promise<void>>> = {};

/** Load a page kind's code (once). */
export function loadPageKind(kind: PageKind): Promise<void> {
  if (loaded[kind]) return Promise.resolve();
  loading[kind] ??= (
    kind === "book"
      ? import("~/features/book/BookRoute").then((m) => void (loaded.book = m.BookRoute))
      : import("~/features/workspace/Workspace").then((m) => void (loaded.text = m.Workspace))
  ).catch((e: unknown) => {
    delete loading[kind]; // a failed chunk can be asked for again
    throw e;
  });
  return loading[kind]!;
}

export const isPageKindLoaded = (kind: PageKind): boolean => !!loaded[kind];

/** The meta tag through which the server tells the hydrating client which kind it rendered. */
export const PAGE_KIND_META = "sefaria-page-kind";

/** The kind the server rendered into this document, if any. */
export function renderedPageKind(doc: Pick<Document, "querySelector"> | undefined = typeof document === "undefined" ? undefined : document): PageKind | undefined {
  const v = doc?.querySelector(`meta[name="${PAGE_KIND_META}"]`)?.getAttribute("content");
  return v === "book" || v === "text" ? v : undefined;
}

export type PageData = ({ kind: "book"; title: string } | ({ kind: "text" } & WorkspaceRouteData));

/** The `$` route's component: the page of the kind the loader found, whose code is already loaded (see above). */
export function ReaderRoute({ data }: { data: PageData }) {
  if (data.kind === "book") {
    const Book = loaded.book;
    // never expected (loader and hydration both load it first): suspending here is the fallback, not the design
    if (!Book) throw loadPageKind("book");
    return <Book title={data.title} />;
  }
  const Text = loaded.text;
  if (!Text) throw loadPageKind("text");
  return <Text data={data} />;
}

/** What the router awaits for the route before React hydrates: the code of the kind on the server-rendered page. */
export function preloadRenderedPageKind(): Promise<void> | undefined {
  const kind = renderedPageKind();
  return kind ? loadPageKind(kind) : undefined;
}
