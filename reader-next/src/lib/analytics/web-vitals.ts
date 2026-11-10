/**
 * Core Web Vitals to GA4 (TARGET_ARCHITECTURE §6.10, decision D1; LAUNCH_PLAN T-D03): one `web_vitals` event per metric through the
 * existing gtag, no new `config`, no new property. The `web-vitals` package is not a dependency (no new npm dependency in this
 * wave), so this is a small first-party measurement on PerformanceObserver following the package's definitions:
 *
 *  - LCP  last `largest-contentful-paint` entry before the first input or the page being hidden
 *  - CLS  largest session window (shifts < 1 s apart, window ≤ 5 s) of layout shifts without recent input
 *  - INP  the worst interaction (the 98th percentile once there are 50+ interactions), from `event` entries by interactionId
 *  - FCP  `first-contentful-paint`;  TTFB  navigation responseStart
 *
 * LCP, CLS and INP are sent once, when the page is first hidden (the package's `reportAllChanges: false`); FCP and TTFB when known.
 * Parameters: metric_name, metric_value, metric_rating, metric_id, page_type, debug_target, and reader_variant "next" so dashboards
 * can split the new reader from the old (the old reader sends no web_vitals event yet; only this event carries reader_variant).
 *
 * On only when remote config says so: `feature.client.remote_config_json` → `webVitals: { enabled: 1, sampleRate }` (missing = off).
 * The analytics parity diff ignores exactly this event name.
 *
 * @feature ANL-014 Third-party analytics and testing scripts (web vitals through the GA4 tag)
 */
import { gtagEvent } from "./core";

export type MetricName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";
export type Rating = "good" | "needs-improvement" | "poor";

/** web.dev's thresholds: [good ≤, poor >]. */
export const THRESHOLDS: Record<MetricName, [number, number]> = { LCP: [2500, 4000], CLS: [0.1, 0.25], INP: [200, 500], FCP: [1800, 3000], TTFB: [800, 1800] };

export const rate = (name: MetricName, v: number): Rating => (v <= THRESHOLDS[name][0] ? "good" : v <= THRESHOLDS[name][1] ? "needs-improvement" : "poor");

export interface WebVitalsSettings {
  enabled?: unknown;
  sampleRate?: unknown;
}

/** remote config → is this page load measured? (`random` is the test seam) */
export function vitalsEnabled(remote: Record<string, unknown> | undefined, random: () => number = Math.random): boolean {
  const cfg = (remote?.["feature.client.remote_config_json"] as { webVitals?: WebVitalsSettings } | undefined)?.webVitals;
  if (!cfg || !(cfg.enabled === 1 || cfg.enabled === true)) return false;
  const rate = typeof cfg.sampleRate === "number" && Number.isFinite(cfg.sampleRate) ? Math.min(1, Math.max(0, cfg.sampleRate)) : 1;
  return random() < rate;
}

/** A short selector for the element a metric points at: tag, id, first class. Never its text. */
export function describeTarget(el: Element | null | undefined): string {
  if (!el || typeof el.tagName !== "string") return "";
  const parts: string[] = [];
  let node: Element | null = el;
  for (let i = 0; node && i < 3; i++, node = node.parentElement) {
    let s = node.tagName.toLowerCase();
    if (node.id) s += `#${node.id}`;
    else {
      const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/)[0] : "";
      if (cls) s += `.${cls}`;
    }
    parts.unshift(s);
    if (node.id) break;
  }
  return parts.join(">").slice(0, 100);
}

/** INP from interaction durations: the worst, or the 98th percentile (one skipped per 50 interactions). */
export function inpOf(durations: number[]): number | null {
  if (!durations.length) return null;
  const sorted = [...durations].sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.floor(durations.length / 50))]!;
}

/** CLS from layout-shift entries: the largest session window. */
export function clsOf(shifts: { value: number; startTime: number }[]): number {
  let max = 0;
  let cur = 0;
  let first = 0;
  let last = 0;
  for (const s of shifts) {
    if (cur && s.startTime - last < 1000 && s.startTime - first < 5000) cur += s.value;
    else {
      cur = s.value;
      first = s.startTime;
    }
    last = s.startTime;
    max = Math.max(max, cur);
  }
  return max;
}

const metricId = () => `v1-${Date.now()}-${Math.floor(Math.random() * 8999999999999) + 1e12}`;

export interface VitalsReport {
  metric_name: MetricName;
  metric_value: number;
  metric_rating: Rating;
  metric_id: string;
  page_type: string;
  debug_target: string;
  reader_variant: "next";
}

export function sendVital(name: MetricName, value: number, pageType: string, target: string): VitalsReport {
  const p: VitalsReport = {
    metric_name: name,
    metric_value: name === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value),
    metric_rating: rate(name, value),
    metric_id: metricId(),
    page_type: pageType,
    debug_target: target,
    reader_variant: "next",
  };
  gtagEvent("web_vitals", { ...p });
  return p;
}

type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] };
type EventEntry = PerformanceEntry & { interactionId?: number; target?: Node | null };
type LcpEntry = PerformanceEntry & { element?: Element | null };

/** Start measuring; `pageType` is read when a metric is sent. Returns the stopper. Browser only. */
export function startWebVitals(pageType: () => string): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return () => {};
  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  const observers: PerformanceObserver[] = [];
  const observe = (type: string, cb: (entries: PerformanceEntry[]) => void, extra: Record<string, unknown> = {}) => {
    if (!supported.includes(type)) return;
    try {
      const o = new PerformanceObserver((list) => cb(list.getEntries()));
      o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      observers.push(o);
    } catch {
      /* unsupported option */
    }
  };

  let lcp: LcpEntry | null = null;
  let lcpFinal = false;
  const shifts: ShiftEntry[] = [];
  const interactions = new Map<number, { duration: number; target: Node | null | undefined }>();

  observe("paint", (es) => {
    const fcp = es.find((e) => e.name === "first-contentful-paint");
    if (fcp) sendVital("FCP", fcp.startTime, pageType(), "");
  });
  observe("largest-contentful-paint", (es) => {
    if (!lcpFinal && es.length) lcp = es[es.length - 1] as LcpEntry;
  });
  observe("layout-shift", (es) => {
    for (const e of es as ShiftEntry[]) if (!e.hadRecentInput) shifts.push(e);
  });
  observe(
    "event",
    (es) => {
      for (const e of es as EventEntry[]) {
        if (!e.interactionId) continue;
        const was = interactions.get(e.interactionId);
        if (!was || e.duration > was.duration) interactions.set(e.interactionId, { duration: e.duration, target: e.target });
      }
    },
    { durationThreshold: 40 },
  );
  // LCP stops at the first input
  const stopLcp = () => {
    lcpFinal = true;
  };
  for (const t of ["keydown", "pointerdown"]) addEventListener(t, stopLcp, { once: true, capture: true });

  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav && nav.responseStart > 0) sendVital("TTFB", Math.max(0, nav.responseStart - ((nav as PerformanceNavigationTiming & { activationStart?: number }).activationStart ?? 0)), pageType(), "");

  let sentFinal = false;
  const flush = (force: boolean) => {
    if (sentFinal || (!force && document.visibilityState !== "hidden")) return;
    sentFinal = true;
    for (const o of observers) {
      try {
        (o as PerformanceObserver & { takeRecords?: () => PerformanceEntryList }).takeRecords?.();
      } catch {
        /* ignore */
      }
    }
    const pt = pageType();
    if (lcp) sendVital("LCP", lcp.startTime, pt, describeTarget(lcp.element));
    const largest = shifts.reduce<ShiftEntry | null>((a, s) => (!a || s.value > a.value ? s : a), null);
    sendVital("CLS", clsOf(shifts), pt, describeTarget(largest?.sources?.[0]?.node as Element | undefined));
    const all = [...interactions.values()];
    const inp = inpOf(all.map((i) => i.duration));
    if (inp !== null) sendVital("INP", inp, pt, describeTarget(all.find((i) => i.duration === inp)?.target as Element | undefined));
    for (const o of observers) o.disconnect();
  };
  const onHidden = () => flush(false);
  const onPageHide = () => flush(true);
  addEventListener("visibilitychange", onHidden, true);
  addEventListener("pagehide", onPageHide, true);
  return () => {
    for (const o of observers) o.disconnect();
    removeEventListener("visibilitychange", onHidden, true);
    removeEventListener("pagehide", onPageHide, true);
  };
}
