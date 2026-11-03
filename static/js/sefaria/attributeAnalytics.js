import { createAnalytics } from '@sefaria/analytics';

// Attribute-based GA4 tracking (data-anl-event / data-anl-* attributes). See the @sefaria/analytics README.

// Parameter names Sefaria sends on top of the package's BASE_ALLOWED_PARAMS. Anything else is dropped.
export const SEFARIA_EXTRA_ALLOWED_PARAMS = [
  'project', 'panel_type', 'panel_number', 'item_id', 'version', 'content_lang',
  'panel_name', 'panel_category', 'ai', 'site_lang', 'traffic_type', 'promotion_name',
  'form_name', 'form_destination',
];

export const TRACKED_CONTAINERS = "#s2, #staticContentWrapper";
export const TRACKED_EVENT_TYPES = ['click', 'scrollIntoView', 'toggle', 'mouseover', 'input', 'inputStart'];

/**
 * Starts attribute-based tracking on the page. Returns the analytics object, or null when
 * Google's tag isn't on the page: window.gtag only exists when templates/base.html loads it
 * (GOOGLE_GTAG is set).
 */
export function attachAttributeAnalytics() {
  if (typeof window.gtag !== 'function') { return null; }
  const analytics = createAnalytics({ extraAllowedParams: SEFARIA_EXTRA_ALLOWED_PARAMS });
  analytics.attach(TRACKED_CONTAINERS, TRACKED_EVENT_TYPES);
  return analytics;
}
