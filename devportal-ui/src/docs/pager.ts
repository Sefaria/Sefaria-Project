// Previous/next links of the docs page footer (contract C6 `Pagination`).
//
// The rule, derived from research/site/pages.json and the source front matter, and proved for every docs
// page by pager.test.ts (and by devportal/tests/pure/pagination_parity_test.py on the Python side):
//
//   1. A page shows the pagination only when its front matter `next.pages` is empty or absent. Pages
//      that list "next" pages show neither the pager nor a "What's next" block on live.
//   2. Previous and next are the page's neighbours in the section's sidebar order, flattened depth
//      first across all categories (so the last page of one category links to the first of the next).
//   3. Only `page` items take part: `link` items (external sidebar links) are skipped, and hidden pages
//      never appear in the tree (contract C3).
//   4. The first page has no previous link and the last page no next link.
import type { Pager, PagerLink, SidebarItem, SidebarTree } from '../contracts';

/** The section's pages in sidebar order (depth first), as pager links. */
export function flattenPages(tree: SidebarTree): PagerLink[] {
  const out: PagerLink[] = [];
  const walk = (items: SidebarItem[]) => {
    for (const item of items) {
      if (item.kind === 'page' || item.kind === 'endpoint') out.push({ title: item.title, path: item.href });
      walk(item.children);
    }
  };
  for (const category of tree.categories) walk(category.items);
  return out;
}

export const NO_PAGER: Pager = { prev: null, next: null };

/**
 * The pager for `path`. `hasNextPages` is whether the page's front matter lists `next.pages`
 * (`PageRevision.next.pages` non-empty); such pages show no pager.
 */
export function pagerFor(tree: SidebarTree, path: string, hasNextPages: boolean): Pager {
  if (hasNextPages) return NO_PAGER;
  const pages = flattenPages(tree);
  const index = pages.findIndex((p) => p.path === path);
  if (index < 0) return NO_PAGER;
  return { prev: pages[index - 1] ?? null, next: pages[index + 1] ?? null };
}
