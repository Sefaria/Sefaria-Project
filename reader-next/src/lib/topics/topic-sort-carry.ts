/**
 * The old topic panel's sort (ReaderApp state.topicSort) outlived the page: once a topic page had a sort (the server's "Relevance" on a
 * full page load, or one the reader chose), the next topic reached inside the app wrote it too (`?sort=…&tab=…`), also by way of a
 * category page (Moses ?sort=Chronological → Biblical Figures → Aaron keeps Chronological). The topics landing started again
 * without one. VERIFIED 2026-11-05 on www.sefaria.org with Playwright. Other pages (the A–Z list, the reader) also forget it here:
 * not verified on live; the A–Z list is reached from the landing anyway.
 *
 * Not ported: on that same trip live writes the topic's stale tab onto the category page's address
 * (`/topics/category/biblical-figures?tab=notable-sources`), which means nothing there.
 */
let carried: string | undefined;

export const carriedTopicSort = (): string | undefined => carried;
export const carryTopicSort = (sort: string | undefined): void => {
  carried = sort;
};

/** A single topic's page: `/topics/<slug>` or `/topics/b/<slug>` (not the landing, a category or the A–Z list). */
export const isSingleTopicPath = (pathname: string): boolean => /^\/topics\/(?:b\/)?[^/]+$/.test(pathname) && !/^\/topics\/(?:all|category)$/.test(pathname);

/** Called on every page change: off the single topic pages and the category pages the sort is forgotten. */
export function forgetTopicSortOff(pathname: string): void {
  if (!isSingleTopicPath(pathname) && !/^\/topics\/category\/[^/]+$/.test(pathname)) carried = undefined;
}
