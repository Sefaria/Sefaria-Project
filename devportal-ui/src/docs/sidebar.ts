import type { SidebarItem } from '../contracts';

/** True when the item or one of its descendants is the current page. */
export function containsPath(item: SidebarItem, path: string): boolean {
  return item.href === path || item.children.some((c) => containsPath(c, path));
}
