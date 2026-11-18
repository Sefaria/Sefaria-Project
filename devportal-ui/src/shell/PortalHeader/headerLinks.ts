// The header's links, as on live developers.sefaria.org (C6 "Header"; REFERENCE_SPEC.md §1.1, SITE_ATLAS.md §2).

/** The tab marked active. Same values as the C3 `HeaderTab`; `contact` is "Get in Touch". */
export type PortalHeaderTab = 'home' | 'docs' | 'reference' | 'contact';

export interface HeaderNavLink {
  label: string;
  href: string;
  tab?: PortalHeaderTab;
  newTab?: boolean;
}

/** The six primary links, in live's order, with live's targets (C6 `PrimaryNav`). */
export const PRIMARY_LINKS: readonly HeaderNavLink[] = [
  { label: 'Home', href: '/', tab: 'home' },
  { label: 'Docs', href: '/docs', tab: 'docs' },
  { label: 'API Reference', href: '/reference', tab: 'reference' },
  { label: 'GitHub', href: 'https://github.com/Sefaria/Sefaria-Project', newTab: true },
  {
    label: 'Donate',
    href: 'https://donate.sefaria.org/give/451346/#!/donation/checkout?c_src=HeaderDev',
    newTab: true,
  },
  { label: 'Get in Touch', href: '/page/contact-us', tab: 'contact' },
];

/** The links menu ("product switcher"). Dots: navy, green, purple, none. Same tab, as live. */
export const LINKS_MENU_ITEMS: readonly {
  label: string;
  href: string;
  dot: 'library' | 'voices' | 'developers' | null;
}[] = [
  { label: 'Sefaria Library', href: 'https://sefaria.org', dot: 'library' },
  { label: 'Voices at Sefaria', href: 'https://voices.sefaria.org', dot: 'voices' },
  { label: 'Developers', href: 'https://developers.sefaria.org', dot: 'developers' },
  { label: 'More from Sefaria ›', href: 'https://sefaria.org/products', dot: null },
];

/** The mobile drawer: the six primary links, then the two product links (new tabs, as live). */
export const DRAWER_LINKS: readonly HeaderNavLink[] = [
  ...PRIMARY_LINKS,
  { label: 'Sefaria Library', href: 'https://sefaria.org', newTab: true },
  { label: 'Voices on Sefaria', href: 'https://voices.sefaria.org', newTab: true },
];
