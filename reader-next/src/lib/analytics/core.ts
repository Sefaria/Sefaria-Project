/**
 * The one place the client talks to analytics. Components call these functions (or declare `data-anl-*` attributes, see
 * declarative.ts); nothing else touches gtag, Simple Analytics or GTM's `ga` shim. Event names and parameters are the old
 * site's, so GA4 reports and dashboards keep working across the switch.
 *
 * Three channels, all as sefaria.org sends them today (VERIFIED 2026-10-06 by recording dataLayer on www.sefaria.org/Genesis.1):
 *  - gtag:  `gtag("event", name, params)` — GA4 property configured in scripts.ts.
 *  - sa:    `sa_event(name, params)` — Simple Analytics (impressions are sent to both).
 *  - ua:    the old Universal Analytics `Track.event(category, action, label, value)`. GTM installs a `ga` shim that converts these
 *           into GA4 events (property "is_legacy_converted"), so they still reach reports; sent only when that shim is present.
 *
 * Every event is also appended to an in-memory log (`analyticsLog`, `window.__SEFARIA_ANALYTICS__`) — tests assert on it and
 * never on network calls. Without IDs configured (development, tests) the vendors are absent and only the log is written.
 *
 * @feature ANL-016 Legacy Universal Analytics wrapper and TrackG4
 */
export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;
export interface LoggedEvent {
  channel: "gtag" | "sa" | "ua";
  name: string;
  params?: AnalyticsParams;
}

type Gtag = (...args: unknown[]) => void;
type SaEvent = (name: string, params?: AnalyticsParams) => void;
interface GaTracker { get(field: string): string }
type Ga = ((...args: unknown[]) => void) & { getAll?: () => GaTracker[] };

declare global {
  interface Window {
    gtag?: Gtag;
    sa_event?: SaEvent;
    ga?: Ga;
    dataLayer?: unknown[];
    __SEFARIA_ANALYTICS__?: LoggedEvent[];
  }
}

const inBrowser = typeof window !== "undefined";
export const analyticsLog: LoggedEvent[] = inBrowser ? (window.__SEFARIA_ANALYTICS__ ??= []) : [];

/** Undefined parameters are dropped, as gtag would (keeps the log comparable with what is sent). */
const clean = (params?: AnalyticsParams): AnalyticsParams | undefined => {
  if (!params) return undefined;
  const out: AnalyticsParams = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined) out[k] = v;
  return out;
};

const record = (e: LoggedEvent) => {
  if (!inBrowser) return;
  analyticsLog.push(e);
  if (analyticsLog.length > 500) analyticsLog.splice(0, analyticsLog.length - 500);
};

/** A GA4 event: `gtag("event", name, params)`. */
export function gtagEvent(name: string, params?: AnalyticsParams): void {
  if (!inBrowser) return;
  const p = clean(params);
  record({ channel: "gtag", name, params: p });
  try {
    if (p) window.gtag?.("event", name, p);
    else window.gtag?.("event", name);
  } catch {
    /* analytics never breaks the page */
  }
}

/** A Simple Analytics event. */
export function saEvent(name: string, params?: AnalyticsParams): void {
  if (!inBrowser) return;
  const p = clean(params);
  record({ channel: "sa", name, params: p });
  try {
    if (p) window.sa_event?.(name, p);
    else window.sa_event?.(name);
  } catch {
    /* ignore */
  }
}

/** Both: the old site sends its impression events (header_viewed, reader_app_mounted, banner_probe_viewed…) to each. */
export function bothEvent(name: string, params?: AnalyticsParams): void {
  saEvent(name, params);
  gtagEvent(name, params);
}

/** The old `Sefaria.track.event(category, action, label, value)` (static/js/sefaria/track.js), through GTM's `ga` shim. */
export function uaEvent(category: string, action: string, label?: string, value?: number): void {
  if (!inBrowser) return;
  record({ channel: "ua", name: `${category}|${action}`, params: clean({ label, value }) });
  try {
    const tracker = window.ga?.getAll?.()[0];
    if (tracker) window.ga!(`${tracker.get("name")}.send`, "event", category, action, label, value);
  } catch {
    /* ignore */
  }
}

/** Once per browser session (sessionStorage key, the old site's names such as "sa.header_viewed"). */
export function oncePerSession(key: string, fn: () => void): void {
  if (!inBrowser) return;
  try {
    if (sessionStorage.getItem(key) !== null) return;
    sessionStorage.setItem(key, "true");
  } catch {
    /* storage blocked: still send once for this page */
  }
  fn();
}
