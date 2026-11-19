/**
 * Plausible-compatible analytics, off unless VITE_ANALYTICS_DOMAIN is set.
 * No cookies, no storage, no user ids; events carry only project ids and UI context,
 * and never search text. Respects Do Not Track and Global Privacy Control.
 *
 * The gallery's GA4 property (`initGa4`) is separate: its measurement id comes from the page payload
 * (`site.ga4.gallery`, the `DEVPORTAL_GA4` setting), never from this file, and it is off when absent.
 */
import { galleryRelativePath } from './paths';

export type SearchResults = '0' | '1-5' | '6+';

export interface AnalyticsEvents {
  project_outbound: {
    project_id: number;
    surface: 'card' | 'list' | 'featured' | 'page';
    has_issues: boolean;
  };
  project_source: { project_id: number };
  featured_open: { project_id: number; position: number };
  filter_change: { facet: string };
  sort_change: { sort: string };
  view_change: { view: string };
  search: { has_query: true; results: SearchResults };
}

interface Plausible {
  (event: string, options?: { u?: string; props?: object }): void;
  q?: unknown[];
}

declare global {
  interface Window {
    plausible?: Plausible;
  }
}

export const DEFAULT_SRC = 'https://plausible.io/js/script.manual.js';

let enabled = false;

interface PrivacySignals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

function optedOut(): boolean {
  const nav = navigator as Navigator & PrivacySignals;
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/** Whether events are being sent. The footer's privacy line follows this. */
export function analyticsEnabled(): boolean {
  return enabled;
}

/** Injects the script when configured and not opted out. Safe to call more than once. */
export function initAnalytics(): boolean {
  if (enabled) return true;
  try {
    const domain = import.meta.env.VITE_ANALYTICS_DOMAIN;
    if (!domain || optedOut()) return false;
    // Plausible's own queue stub, so events fired before the script loads aren't lost.
    const queue: Plausible = (...args: unknown[]) => {
      (queue.q ??= []).push(args);
    };
    window.plausible ??= queue;
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.domain = domain;
    script.src = import.meta.env.VITE_ANALYTICS_SRC || DEFAULT_SRC;
    document.head.appendChild(script);
    enabled = true;
    return true;
  } catch {
    return false;
  }
}

/** For tests. */
export function resetAnalytics() {
  enabled = false;
  ga4Id = null;
}

// ---- GA4 -----------------------------------------------------------------------------------------

/** gtag's command queue, as Google's snippet defines it. Typed locally: the portal's analytics module owns the global. */
type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js';

let ga4Id: string | null = null;

/** The GA4 measurement id in use, or null while GA4 is off. */
export function ga4MeasurementId(): string | null {
  return ga4Id;
}

/**
 * Loads gtag.js for the gallery's GA4 property, as the gallery's own `index.html` did: unconditional once an
 * id is given, page views from the property's enhanced measurement (history changes). No id (the default
 * outside production) means GA4 stays off. When gtag is already on the page (the portal's analytics module
 * loaded it for this property), nothing is loaded twice. Safe to call more than once.
 */
export function initGa4(measurementId: string | null | undefined): boolean {
  if (!measurementId) return false;
  if (ga4Id === measurementId) return true;
  try {
    const w = window as GtagWindow;
    ga4Id = measurementId;
    if (typeof w.gtag === 'function') return true;
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag.js reads the arguments object itself, not an array: keep Google's snippet as written.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer?.push(arguments);
    };
    w.gtag('js', new Date());
    w.gtag('config', measurementId);
    const script = document.createElement('script');
    script.async = true;
    script.src = `${GTAG_SRC}?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
    return true;
  } catch {
    return false;
  }
}

function send(event: string, props?: object) {
  if (!enabled) return;
  try {
    // The manual script reports the full current URL, which can carry ?q=…: send it without query or hash.
    const u = `${window.location.origin}${window.location.pathname}`;
    window.plausible?.(event, props ? { u, props } : { u });
  } catch {
    // analytics must never break the page
  }
}

export function track<E extends keyof AnalyticsEvents>(event: E, props: AnalyticsEvents[E]) {
  send(event, props);
}

/** SPA page view. The charts page is never counted. */
export function trackPageview(pathname: string) {
  const path = galleryRelativePath(pathname); // lowercased: the router matches /powered-by/Charts too
  if (path === '/charts' || path.startsWith('/charts/')) return;
  send('pageview');
}

export function searchResultsBucket(count: number): SearchResults {
  return count === 0 ? '0' : count <= 5 ? '1-5' : '6+';
}
