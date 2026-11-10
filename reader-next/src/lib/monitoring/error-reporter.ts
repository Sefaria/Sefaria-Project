/**
 * Browser error reporting (LAUNCH_PLAN T-D01, decision D-8: required before real users; Sentry stays out). A small first-party
 * reporter: uncaught errors, unhandled rejections, React error boundaries and hydration mismatches, each sent as one JSON beacon
 * (`navigator.sendBeacon`) to PUBLIC_ERROR_ENDPOINT. Off when that is unset (development, tests that do not ask for it).
 *
 * What a report carries is fixed by `ErrorReport` below and nothing else: the error's message and stack (truncated, with every query
 * string, fragment and e-mail address scrubbed), the release (APP_VERSION), the route kind, a signed-in flag, the page's path without
 * its query, and a coarse user-agent class. Never page text, never a user id, never a query string.
 *
 * Sampling: one decision per page load (PUBLIC_ERROR_SAMPLE_RATE, default 1). Cap: at most MAX_PER_PAGE reports per page load, and an
 * identical error (same kind, message and first stack line) only once.
 *
 * The receiving endpoint's contract is in the lane-C report (rn-shared/reports/c-observability.md, "Error beacon contract").
 *
 * @feature ANL-017 Browser error reporting
 */
import { routeKind, type RouteKind } from "./route-kind";

export type ErrorKind = "error" | "unhandledrejection" | "boundary" | "hydration";

/** One beacon's body (JSON). Version the shape with `v`; the endpoint must ignore fields it does not know. */
export interface ErrorReport {
  v: 1;
  kind: ErrorKind;
  /** Where a React boundary caught it ("root", "route", "panel"); absent for window-level errors. */
  boundary?: string;
  message: string;
  stack?: string;
  /** For window errors: the script's path (no query) and line:column. */
  source?: string;
  release: string | null;
  route: RouteKind;
  signedIn: boolean;
  /** location.pathname only. */
  path: string;
  ua: UaClass;
  /** The sample rate this page load was kept at, so the receiver can scale counts. */
  sampleRate: number;
  /** Milliseconds since navigation start. */
  t: number;
}

export type UaClass = `${"chrome" | "safari" | "firefox" | "edge" | "samsung" | "other"}-${"mobile" | "desktop"}` | "bot";

export const MAX_PER_PAGE = 10;
export const MESSAGE_MAX = 500;
export const STACK_MAX = 4000;

export interface ReporterOptions {
  endpoint: string | null | undefined;
  release: string | null | undefined;
  sampleRate?: number;
  /** Is a reader signed in right now (read at report time). */
  signedIn?: () => boolean;
  /** Test seams. */
  random?: () => number;
  send?: (url: string, body: string) => boolean;
}

/** Query strings, fragments and e-mail addresses out; the rest kept. */
export function scrub(s: string): string {
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/((?:https?:\/\/|\/)[^\s?#"'()<>]*)[?#][^\s"'()<>,;]*/g, (_m, base: string) => {
      // keep a stack frame's ":line:col" that followed the query
      const pos = _m.match(/(:\d+:\d+)$/);
      return base + (pos ? pos[1] : "");
    });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function uaClass(ua: string): UaClass {
  if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom|preview/i.test(ua)) return "bot";
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
  const family = /SamsungBrowser/.test(ua) ? "samsung" : /Edg\//.test(ua) ? "edge" : /Firefox\/|FxiOS/.test(ua) ? "firefox" : /Chrome\/|CriOS/.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "other";
  return `${family}-${mobile}`;
}

const errorParts = (e: unknown): { message: string; stack?: string } => {
  if (e instanceof Error) return { message: `${e.name}: ${e.message}`, stack: e.stack };
  if (typeof e === "string") return { message: e };
  try {
    return { message: `Non-Error: ${JSON.stringify(e)}` };
  } catch {
    return { message: "Non-Error value" };
  }
};

/** A React "hydration" error (React 19 reports them through onRecoverableError and console.error). */
export const isHydrationMessage = (m: string) => /hydrat|did not match|server rendered|server HTML/i.test(m);

export class ErrorReporter {
  private sent = 0;
  private seen = new Set<string>();
  private readonly keep: boolean;
  readonly sampleRate: number;

  constructor(private readonly opts: ReporterOptions) {
    const rate = opts.sampleRate ?? 1;
    this.sampleRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 1;
    this.keep = !!opts.endpoint && (opts.random ?? Math.random)() < this.sampleRate;
  }

  get enabled(): boolean {
    return this.keep;
  }

  /** Build (and send, unless sampled out, capped or a duplicate) one report. Returns the report sent, or null. */
  report(kind: ErrorKind, error: unknown, extra: { boundary?: string; source?: string } = {}): ErrorReport | null {
    if (!this.keep || this.sent >= MAX_PER_PAGE) return null;
    const { message, stack } = errorParts(error);
    const firstFrame = stack?.split("\n").find((l) => /\d+:\d+/.test(l)) ?? "";
    const key = `${kind}|${message}|${firstFrame}`;
    if (this.seen.has(key)) return null;
    this.seen.add(key);
    const loc = typeof location !== "undefined" ? location : undefined;
    const report: ErrorReport = {
      v: 1,
      kind,
      ...(extra.boundary ? { boundary: extra.boundary } : {}),
      message: clip(scrub(message), MESSAGE_MAX),
      ...(stack ? { stack: clip(scrub(stack), STACK_MAX) } : {}),
      ...(extra.source ? { source: clip(scrub(extra.source), 300) } : {}),
      release: this.opts.release ?? null,
      route: routeKind(loc?.pathname ?? "/"),
      signedIn: !!this.opts.signedIn?.(),
      path: loc?.pathname ?? "",
      ua: uaClass(typeof navigator !== "undefined" ? navigator.userAgent : ""),
      sampleRate: this.sampleRate,
      t: Math.round(typeof performance !== "undefined" ? performance.now() : 0),
    };
    const body = JSON.stringify(report);
    const send =
      this.opts.send ??
      ((url: string, b: string) => {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") return navigator.sendBeacon(url, new Blob([b], { type: "application/json" }));
        return false;
      });
    try {
      if (!send(this.opts.endpoint!, body)) return null;
    } catch {
      return null; // reporting never breaks the page
    }
    this.sent++;
    return report;
  }

  /** window `error` and `unhandledrejection` listeners; returns the uninstaller. */
  install(target: Pick<Window, "addEventListener" | "removeEventListener"> = window): () => void {
    const onError = (e: ErrorEvent) => {
      // a resource that failed to load (img/script) is an Event, not an ErrorEvent with an error: not ours to report here
      if (!(e instanceof ErrorEvent)) return;
      const source = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined;
      const err = e.error ?? e.message;
      // React 19 hands a hydration mismatch it recovered from to window.reportError, which lands here
      this.report(isHydrationMessage(errorParts(err).message) ? "hydration" : "error", err, { source });
    };
    const onRejection = (e: PromiseRejectionEvent) => this.report("unhandledrejection", e.reason);
    target.addEventListener("error", onError);
    target.addEventListener("unhandledrejection", onRejection);
    return () => {
      target.removeEventListener("error", onError);
      target.removeEventListener("unhandledrejection", onRejection);
    };
  }
}

/** The page's reporter, once installed (src/features/shell/Monitoring.tsx); boundaries report through it. */
let current: ErrorReporter | null = null;
export const setPageReporter = (r: ErrorReporter | null) => {
  current = r;
};
export const pageReporter = () => current;

/** For React boundaries and onRecoverableError: report through the page's reporter, if any. */
export function reportError(kind: ErrorKind, error: unknown, extra?: { boundary?: string }): ErrorReport | null {
  return current?.report(kind, error, extra) ?? null;
}
