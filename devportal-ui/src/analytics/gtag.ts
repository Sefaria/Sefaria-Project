// Loading Google's gtag.js (PLAN §2.13, contract C8). The CSP allows https://www.googletagmanager.com
// for scripts and the GA4 collect hosts for connect-src (contract C10), so the script is inserted from
// the bundle and needs no nonce.
import type { SiteConfig } from '../contracts';

export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js';
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;

/** The section whose GA4 property the gallery loads itself (src/gallery, `initGa4`). */
export const GALLERY_SECTION = 'gallery';

export type Gtag = (command: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/**
 * The measurement id for the page: `site.ga4[site.analyticsSection]` (C8). Null when the mapping has
 * no entry for the section (the default outside production is an empty mapping), when the value is not
 * a GA4 id, and on the gallery, which loads its own property.
 */
export function measurementId(site: Pick<SiteConfig, 'ga4' | 'analyticsSection'> | null | undefined): string | null {
  if (!site || site.analyticsSection === GALLERY_SECTION) return null;
  const ga4: Record<string, unknown> = site.ga4 ?? {};
  const id = Object.prototype.hasOwnProperty.call(ga4, site.analyticsSection) ? ga4[site.analyticsSection] : null;
  return typeof id === 'string' && MEASUREMENT_ID.test(id) ? id : null;
}

/**
 * Installs the standard gtag stub and inserts gtag.js for `id`, configured with
 * `send_page_view: false`: the portal sends each page_view itself (startAnalytics).
 */
export function loadGtag(id: string, win: Window = window): Gtag {
  const doc = win.document;
  win.dataLayer = win.dataLayer ?? [];
  const dataLayer = win.dataLayer;
  const gtag: Gtag =
    win.gtag ??
    function gtag() {
      // gtag.js reads Arguments objects from the data layer, not arrays.
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
  win.gtag = gtag;
  const src = `${GTAG_SRC}?id=${encodeURIComponent(id)}`;
  if (!doc.querySelector(`script[src="${src}"]`)) {
    const script = doc.createElement('script');
    script.async = true;
    script.src = src;
    doc.head.appendChild(script);
  }
  gtag('js', new Date());
  gtag('config', id, { send_page_view: false });
  return gtag;
}
