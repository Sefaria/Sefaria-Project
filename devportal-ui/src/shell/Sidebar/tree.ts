// Pure helpers over the C3 sidebar tree: which groups start open, and what the filter keeps.
import type { SidebarCategory, SidebarItem } from '../../contracts';

/** True when the item or one of its descendants is the page at `path`. */
export function containsPath(item: SidebarItem, path: string): boolean {
  return item.href === path || item.children.some((c) => containsPath(c, path));
}

/**
 * The ids of the groups that contain the current page: the only groups open on load (REFERENCE_SPEC §1.2:
 * "Only the group containing the current page is expanded on load"). A group that is itself the current page opens
 * too, as on live (/docs/powered-by-sefaria shows "Project Acceptance Criteria").
 */
export function groupsContaining(categories: readonly SidebarCategory[], path: string): number[] {
  const ids: number[] = [];
  const walk = (items: readonly SidebarItem[]) => {
    for (const item of items) {
      if (item.children.length > 0 && containsPath(item, path)) {
        ids.push(item.id);
        walk(item.children);
      }
    }
  };
  for (const category of categories) walk(category.items);
  return ids;
}

function matches(item: SidebarItem, query: string): boolean {
  return item.title.toLocaleLowerCase().includes(query);
}

function keepAll(item: SidebarItem): SidebarItem {
  return item;
}

function filterItem(item: SidebarItem, query: string): SidebarItem | null {
  // A row that matches keeps its whole subtree (live: "index" keeps "Table of Contents" under "Index").
  if (matches(item, query)) return keepAll(item);
  const children = item.children.map((c) => filterItem(c, query)).filter((c): c is SidebarItem => c !== null);
  return children.length > 0 ? { ...item, children } : null;
}

/**
 * The tree narrowed to `query` (case-insensitive substring of the title): a row stays when it matches, when an
 * ancestor matches, or when a descendant matches. Categories left empty are dropped. An empty query keeps all.
 */
export function filterCategories(categories: readonly SidebarCategory[], query: string): SidebarCategory[] {
  const q = query.trim().toLocaleLowerCase();
  if (q === '') return [...categories];
  const out: SidebarCategory[] = [];
  for (const category of categories) {
    const items = category.items.map((i) => filterItem(i, q)).filter((i): i is SidebarItem => i !== null);
    if (items.length > 0) out.push({ ...category, items });
  }
  return out;
}
