// Contract C3, the sidebar tree. Mirrors devportal/contracts/schemas/sidebar-tree.schema.json.
// Served at GET /_portal/nav/<section>.json and embedded in page payloads (PageNav.tree).
import type { ContractVersion, HttpMethod, NavSection } from './common';

interface SidebarItemBase {
  /** `Page.id`. */
  id: number;
  title: string;
  /** In-portal path, or the absolute URL of a `link` item. */
  href: string;
  /** Only `link` items may open in a new tab. */
  newTab: boolean;
  deprecated: boolean;
  /** Visible children in `position` order. Hidden pages never appear in the tree (I-6). */
  children: SidebarItem[];
}

/** A page, a tag group (`/reference/text`, which answers 302 to its first child) or a link. */
export interface SidebarPageItem extends SidebarItemBase {
  kind: 'page' | 'tag_group' | 'link';
  method: null;
}

/** An endpoint row, with its method pill. */
export interface SidebarEndpointItem extends SidebarItemBase {
  kind: 'endpoint';
  method: HttpMethod;
}

export type SidebarItem = SidebarPageItem | SidebarEndpointItem;

/** A sidebar heading such as "TECHNICAL DOCS". Stored in mixed case; CSS upper-cases it. */
export interface SidebarCategory {
  id: number;
  title: string;
  items: SidebarItem[];
}

export interface SidebarTree {
  contractVersion: ContractVersion;
  section: NavSection;
  /** `PortalState.generation` the tree was built at. */
  generation: number;
  categories: SidebarCategory[];
}
