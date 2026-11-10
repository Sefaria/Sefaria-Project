/**
 * Browser error reporting (LAUNCH_PLAN T-D01, decision D-8: required before real users; Sentry stays out). A small first-party
 * reporter: uncaught errors, unhandled rejections, React error boundaries and hydration mismatches, each sent as one JSON beacon
 * (`navigator.sendBeacon`) to PUBLIC_ERROR_ENDPOINT. Off when that is unset (development, tests that do not ask for it).
 *
 * PUBLIC_ERROR_ENDPOINT must be on the page's own origin (a path such as "/api/reader-errors"): a beacon to another origin would need
 * CORS for its JSON body, and the endpoint must not need CSRF (a beacon cannot carry the header).
 *
 * Installed at module load in the browser (src/lib/monitoring/browser.ts, imported by src/router.tsx), before hydration, so React 19's
 * recovered hydration errors (handed to window.reportError after the commit) and errors in the first effects are caught.
 *
 * What a report carries is fixed by `ErrorReport` below and nothing else: the error's message and stack (clipped, then every query
 * string, fragment and e-mail address scrubbed), the release (APP_VERSION), the route kind, a signed-in flag, the page's path without
 * its query and with secrets collapsed (redact-path.ts), and a coarse user-agent class. Never page text, never a user id, never a query
 * string; a thrown non-Error value is reported by its type only.
 *
 * Flood control: off for bots; one sampling decision per page load (PUBLIC_ERROR_SAMPLE_RATE, default 1); at most MAX_PER_PAGE reports
 * per page load and MAX_PER_SESSION per browser session; an identical error (kind, message, first stack frame) once; a 4xx API answer
 * (an unknown ref, a missing page) is the reader's request, not a bug, and is not reported.
 *
 * The receiving endpoint's contract is in the lane-C report (rn-shared/reports/c-observability.md, "Error beacon contract").
 *
 * @feature ANL-017 Browser error reporting
 */
import { redactPath } from "./redact-path";
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
  /** location.pathname, secrets collapsed (redactPath). */
  path: string;
  ua: UaClass;
  /** The sample rate this page load was kept at, so the receiver can scale counts. */
  sampleRate: number;
  /** Milliseconds since navigation start. */
  t: number;
}

export type UaClass = `${"chrome" | "safari" | "firefox" | "edge" | "samsung" | "other"}-${"mobile" | "desktop"}` | "bot";

export const MAX_PER_PAGE = 10;
export const MAX_PER_SESSION = 30;
export const MESSAGE_MAX = 500;
export const STACK_MAX = 4000;
const SESSION_KEY = "sefaria_error_reports";

export interface ReporterOptions {
  endpoint: string | null | undefined;
  release: string | null | undefined;
  sampleRate?: number;
  /** Is a reader signed in right now (read at report time). */
  signedIn?: () => boolean;
  /** Test seams. */
  random?: () => number;
  send?: (url: string, body: string) => boolean;
  userAgent?: string;
  session?: Pick<Storage, "getItem" | "setItem"> | null;
}

/** Query strings, fragments and e-mail addresses out; the rest kept. Callers clip first: the URL pattern is slow on huge strings. */
export function scrub(s: string): string {
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/((?:https?:\/\/|\/)[^\s?#"'()<>]*)[?#][^\s"'()<>,;]*/g, (m, base: string) => {
      // keep a stack frame's ":line:col" that followed the query
      const pos = m.match(/(:\d+:\d+)$/);
      return base + (pos ? pos[1] : "");
    });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Clip to twice the limit, scrub, clip to the limit: scrubbing never sees an unbounded string. */
const clean = (s: string, n: number) => clip(scrub(s.slice(0, 2 * n)), n);

export function uaClass(ua: string): UaClass {
  if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom|preview|facebookexternalhit|bingpreview|python-requests|curl\//i.test(ua)) return "bot";
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
  const family = /SamsungBrowser/.test(ua) ? "samsung" : /Edg\//.test(ua) ? "edge" : /Firefox\/|FxiOS/.test(ua) ? "firefox" : /Chrome\/|CriOS/.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "other";
  return `${family}-${mobile}`;
}

/** The type of a thrown non-Error value, never its content. */
const typeName = (v: unknown): string => {
  if (v === null) return "null";
  if (typeof v !== "object") return typeof v;
  const name = (v as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof name === "string" && name ? name : "Object";
};

const errorParts = (e: unknown): { message: string; stack?: string } => {
  if (e instanceof Error) return { message: `${e.name}: ${e.message}`, stack: typeof e.stack === "string" ? e.stack : undefined };
  // a window error event without an Error carries its message as a string (a cross-origin script: "Script error.")
  if (typeof e === "string") return { message: e };
  return { message: `Non-Error thrown: ${typeName(e)}` };
};

/** A React hydration error: the development wording, and production's minified errors #418, #419, #423, #425. */
export const isHydrationMessage = (m: string) => /hydrat|did not match|server rendered|server HTML/i.test(m) || /#(?:418|419|423|425)\b/.test(m);

/** A 4xx answer from the API (an unknown ref, a missing page): the reader's request, not a bug. */
const isClientApiError = (e: unknown) => {
  const x = e as { name?: unknown; status?: unknown } | null;
  return !!x && typeof x === "object" && x.name === "SefariaApiError" && typeof x.status === "number" && x.status >= 400 && x.status < 500;
};

export class ErrorReporter {
  private sent = 0;
  private seen = new Set<string>();
  private readonly keep: boolean;
  readonly sampleRate: number;

  constructor(private readonly opts: ReporterOptions) {
    const rate = opts.sampleRate ?? 1;
    this.sampleRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 1;
    const ua = opts.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
    this.keep = !!opts.endpoint && uaClass(ua) !== "bot" && (opts.random ?? Math.random)() < this.sampleRate;
  }

  get enabled(): boolean {
    return this.keep;
  }

  private session(): Pick<Storage, "getItem" | "setItem"> | null {
    if (this.opts.session !== undefined) return this.opts.session;
    try {
      return sessionStorage;
    } catch {
      return null;
    }
  }

  /** Build (and send, unless sampled out, capped, a duplicate or a 4xx API answer) one report. Returns the report sent, or null. */
  report(kind: ErrorKind, error: unknown, extra: { boundary?: string; source?: string } = {}): ErrorReport | null {
    if (!this.keep || this.sent >= MAX_PER_PAGE || isClientApiError(error)) return null;
    const store = this.session();
    let sessionCount = 0;
    try {
      sessionCount = Number(store?.getItem(SESSION_KEY)) || 0;
    } catch {
      /* storage blocked: the page cap still holds */
    }
    if (sessionCount >= MAX_PER_SESSION) return null;
    const { message, stack } = errorParts(error);
    const firstFrame = stack?.split("\n").find((l) => /\d+:\d+/.test(l)) ?? "";
    const key = `${kind}|${message.slice(0, 200)}|${firstFrame.slice(0, 200)}`;
    if (this.seen.has(key)) return null;
    this.seen.add(key);
    const loc = typeof location !== "undefined" ? location : undefined;
    const report: ErrorReport = {
      v: 1,
      kind,
      ...(extra.boundary ? { boundary: extra.boundary } : {}),
      message: clean(message, MESSAGE_MAX),
      ...(stack ? { stack: clean(stack, STACK_MAX) } : {}),
      ...(extra.source ? { source: clean(extra.source, 300) } : {}),
      release: this.opts.release ?? null,
      route: routeKind(loc?.pathname ?? "/"),
      signedIn: !!this.opts.signedIn?.(),
      path: redactPath(loc?.pathname ?? ""),
      ua: uaClass(this.opts.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")),
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
    try {
      store?.setItem(SESSION_KEY, String(sessionCount + 1));
    } catch {
      /* ignore */
    }
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
      this.report(isHydrationMessage(errorParts(err).message.slice(0, 2000)) ? "hydration" : "error", err, { source });
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

/** The page's reporter, once installed (src/lib/monitoring/browser.ts); boundaries report through it. */
let current: ErrorReporter | null = null;
export const setPageReporter = (r: ErrorReporter | null) => {
  current = r;
};
export const pageReporter = () => current;

/** For React boundaries and other callers: report through the page's reporter, if any. */
export function reportError(kind: ErrorKind, error: unknown, extra?: { boundary?: string }): ErrorReport | null {
  return current?.report(kind, error, extra) ?? null;
}
