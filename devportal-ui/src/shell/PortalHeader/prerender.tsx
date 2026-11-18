// The header variants Django includes (PLAN §2.5): scripts/prerender.ts renders each with react-dom/server
// into dist/prerender/, and `{% devportal_prerendered "header" <tab> %}` includes one. The browser then
// renders the same component; prerender.test.tsx checks that both produce the same markup.
import { renderToStaticMarkup } from 'react-dom/server';
import type { PortalHeaderTab } from './headerLinks';
import { PortalHeader } from './PortalHeader';

/** Manifest key for a page with no active tab (the 404 page, the gallery, the editor). */
export const NO_TAB = 'none';
export type HeaderVariantKey = PortalHeaderTab | typeof NO_TAB;
export const HEADER_VARIANT_KEYS: readonly HeaderVariantKey[] = ['home', 'docs', 'reference', 'contact', NO_TAB];

/**
 * Placeholder for the page title in the `-subnav` variants (pages with a sidebar show the ≤768px sub-nav
 * button). Django replaces it with the HTML-escaped page title; the token needs no escaping itself.
 */
export const SUBNAV_LABEL_TOKEN = '__DP_SUBNAV_LABEL__';
/** The sidebar column's id (`SIDEBAR_ID` in src/app/PortalPage.tsx), which the sub-nav button controls. */
export const SUBNAV_CONTROLS = 'dp-sidebar';

export interface HeaderVariant {
  /** Manifest kind: `header`, or `header-subnav` for the variant with the sub-nav row. */
  kind: 'header' | 'header-subnav';
  key: HeaderVariantKey;
  file: string;
  /** The props the variant renders with (the client renders the same ones). */
  props: Parameters<typeof PortalHeader>[0];
}

const noop = () => {};

export function headerVariants(): HeaderVariant[] {
  return HEADER_VARIANT_KEYS.flatMap((key): HeaderVariant[] => {
    const activeTab = key === NO_TAB ? null : key;
    return [
      { kind: 'header', key, file: `header-${key}.html`, props: { activeTab } },
      {
        kind: 'header-subnav',
        key,
        file: `header-${key}-subnav.html`,
        props: {
          activeTab,
          subnav: { label: SUBNAV_LABEL_TOKEN, expanded: false, onToggle: noop, controls: SUBNAV_CONTROLS },
        },
      },
    ];
  });
}

/**
 * The header's markup. React 19's server renderer hoists a `<link rel="preload" as="image">` for the logo
 * in front of the fragment; it belongs in `<head>` (Django's base template preloads the logo), not in an
 * included fragment, so it is dropped here.
 */
export function renderHeader(props: HeaderVariant['props']): string {
  return renderToStaticMarkup(<PortalHeader {...props} />).replace(/^(?:<link [^>]*>)+/, '');
}
