// The portal's GA4 integration (PLAN §2.13, contract C8).
//
// - gtag.js loads only when the page payload maps the page's section to a measurement id
//   (`site.ga4[site.analyticsSection]`); an empty mapping loads nothing and sends nothing.
// - The property is configured with `send_page_view: false`. This module sends exactly one page_view
//   on the first load and one per client-side navigation (a change of path or query; a fragment change
//   is not a navigation), after setting `document.title` to the page's title.
// - Key events reach gtag only through the `dp-analytics` bus (track.ts), checked against C8 there.
//   Discord links are reported from a delegated click listener on `[data-discord-cta]`;
//   `contact_form_start` is sent at most once per page view.
import type { PagePayload, SiteConfig } from '../contracts';
import { loadGtag, measurementId, type Gtag } from './gtag';
import { ANALYTICS_EVENT, DISCORD_CTA_ATTRIBUTE, sanitizeEvent, track } from './track';
import { DISCORD_PLACEMENTS, type DiscordPlacement } from './events';

/** The part of a React Router data router this module reads. */
export interface RouterLike {
  state: {
    navigation: { state: string };
    location: { pathname: string; search: string };
    loaderData: Record<string, unknown>;
  };
  subscribe(listener: (state: RouterLike['state']) => void): () => void;
}

export interface StartAnalyticsOptions {
  /** The first page's payload (the `#dp-data` island). */
  data: PagePayload | null;
  /** The portal router; without it only the first page view is sent. */
  router?: RouterLike | null;
  /** The route id whose loader data is the page payload (src/app/routes.tsx `PAGE_ROUTE_ID`). */
  routeId?: string;
  win?: Window;
  /** Tests: replaces loading gtag.js. */
  load?: (id: string, win: Window) => Gtag;
}

export type StopAnalytics = () => void;

type Titled = { kind: string; title?: string; site?: SiteConfig };

function pagePayloadOf(value: unknown): Titled | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return typeof record.kind === 'string' ? (record as Titled) : null;
}

function placementOf(element: Element): DiscordPlacement | null {
  const value = element.getAttribute(DISCORD_CTA_ATTRIBUTE);
  return (DISCORD_PLACEMENTS as readonly string[]).includes(value ?? '') ? (value as DiscordPlacement) : null;
}

/**
 * Reports clicks on Discord CTAs (`a[data-discord-cta]`) as `discord_cta_click` (C8). Used by
 * startAnalytics; exported for pages that track without the router.
 */
export function installDiscordTracking(doc: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest(`[${DISCORD_CTA_ATTRIBUTE}]`);
    if (!link) return;
    const placement = placementOf(link);
    if (placement) track('discord_cta_click', { placement });
  };
  // Capture phase, so a handler that stops propagation does not hide the click.
  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}

/** Starts analytics for the page. Returns a function that stops listening (the script stays). */
export function startAnalytics({
  data,
  router = null,
  routeId = 'page',
  win = window,
  load = loadGtag,
}: StartAnalyticsOptions): StopAnalytics {
  const id = measurementId(data && data.kind !== 'redirect' ? data.site : null);
  if (id === null) return () => {};
  const gtag = load(id, win);
  const doc = win.document;
  let contactStarted = false;
  let lastKey = '';

  const pageView = (title: string, pathname: string, search: string) => {
    lastKey = pathname + search;
    contactStarted = false;
    doc.title = title;
    gtag('event', 'page_view', {
      page_title: title,
      page_location: `${win.location.origin}${pathname}${search}`,
    });
  };

  if (data && data.kind !== 'redirect') {
    pageView(data.title, win.location.pathname, win.location.search);
  } else {
    lastKey = win.location.pathname + win.location.search;
  }

  const unsubscribe = router
    ? router.subscribe((state) => {
        if (state.navigation.state !== 'idle') return;
        const { pathname, search } = state.location;
        if (pathname + search === lastKey) return;
        const payload = pagePayloadOf(state.loaderData[routeId]);
        if (!payload || payload.kind === 'redirect' || typeof payload.title !== 'string') return;
        pageView(payload.title, pathname, search);
      })
    : () => {};

  const onEvent = (event: Event) => {
    const sanitized = sanitizeEvent((event as CustomEvent).detail);
    if (!sanitized) return;
    if (sanitized.name === 'contact_form_start') {
      if (contactStarted) return;
      contactStarted = true;
    }
    gtag('event', sanitized.name, sanitized.params);
  };
  win.addEventListener(ANALYTICS_EVENT, onEvent);
  const stopDiscord = installDiscordTracking(doc);

  return () => {
    unsubscribe();
    win.removeEventListener(ANALYTICS_EVENT, onEvent);
    stopDiscord();
  };
}
