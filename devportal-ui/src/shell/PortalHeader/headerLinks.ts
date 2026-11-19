// The header's links, as on live developers.sefaria.org (C6 "Header"; REFERENCE_SPEC.md §1.1, SITE_ATLAS.md §2).

/** The tab marked active. Same values as the C3 `HeaderTab`; `contact` is "Get in Touch". */
export type PortalHeaderTab = 'home' | 'docs' | 'reference' | 'gallery' | 'contact';

export interface HeaderNavLink {
  label: string;
  href: string;
  tab?: PortalHeaderTab;
  newTab?: boolean;
  /** A shorter label for the bar between 769 and 1279px, where the full one would push the last links out of view. */
  shortLabel?: string;
  /** Registered deviation from live (e2e-tests/developers-visual/deviations.ts), for the visual-parity harness. */
  deviation?: string;
}

/**
 * The primary links: live's six, in live's order, with live's targets (C6 `PrimaryNav`), plus the Powered by Sefaria
 * gallery, which lives on the portal instead of powered-by.sefaria.org.
 */
export const PRIMARY_LINKS: readonly HeaderNavLink[] = [
  { label: 'Home', href: '/', tab: 'home' },
  { label: 'Docs', href: '/docs', tab: 'docs' },
  { label: 'API Reference', href: '/reference', tab: 'reference' },
  {
    label: 'Projects Powered by Sefaria',
    shortLabel: 'Projects',
    href: '/powered-by',
    tab: 'gallery',
    deviation: 'D-14',
  },
  { label: 'GitHub', href: 'https://github.com/Sefaria/Sefaria-Project', newTab: true },
  {
    label: 'Donate',
    href: 'https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=HeaderDev',
    newTab: true,
  },
  { label: 'Get in Touch', href: '/page/contact-us', tab: 'contact' },
];

/** The other Sefaria sites the header links to. Production's addresses, as live has them. */
export interface SiteLinks {
  library: string;
  voices: string;
  developers: string;
}

export const PRODUCTION_SITE_LINKS: SiteLinks = {
  library: 'https://sefaria.org',
  voices: 'https://voices.sefaria.org',
  developers: 'https://developers.sefaria.org',
};

/**
 * The addresses of this environment's sites: Django puts them on <html> (`data-dp-library-url` …,
 * devportal_assets.devportal_site_links), so a cauldron's header links to that cauldron's Library and Voices.
 * Production's addresses when there is no document (the build-time prerender) or no attribute.
 */
export function siteLinks(): SiteLinks {
  const data = typeof document === 'undefined' ? undefined : document.documentElement.dataset;
  return {
    library: data?.dpLibraryUrl || PRODUCTION_SITE_LINKS.library,
    voices: data?.dpVoicesUrl || PRODUCTION_SITE_LINKS.voices,
    developers: data?.dpDevelopersUrl || PRODUCTION_SITE_LINKS.developers,
  };
}

export interface LinksMenuItem {
  label: string;
  href: string;
  dot: 'library' | 'voices' | 'developers' | null;
}

/** The links menu ("product switcher"). Dots: navy, green, purple, none. Same tab, as live. */
export function linksMenuItems(sites: SiteLinks = siteLinks()): readonly LinksMenuItem[] {
  return [
    { label: 'Sefaria Library', href: sites.library, dot: 'library' },
    { label: 'Voices at Sefaria', href: sites.voices, dot: 'voices' },
    { label: 'Developers', href: sites.developers, dot: 'developers' },
    { label: 'More from Sefaria ›', href: `${sites.library}/products`, dot: null },
  ];
}

/** The mobile drawer: the primary links, then the two product links (new tabs, as live). */
export function drawerLinks(sites: SiteLinks = siteLinks()): readonly HeaderNavLink[] {
  return [
    ...PRIMARY_LINKS,
    { label: 'Sefaria Library', href: sites.library, newTab: true },
    { label: 'Voices on Sefaria', href: sites.voices, newTab: true },
  ];
}

/** Production's links menu and drawer (the prerendered header; tests). */
export const LINKS_MENU_ITEMS: readonly LinksMenuItem[] = linksMenuItems(PRODUCTION_SITE_LINKS);
export const DRAWER_LINKS: readonly HeaderNavLink[] = drawerLinks(PRODUCTION_SITE_LINKS);
