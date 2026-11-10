/**
 * The shell's watchers, mounted once (src/routes/__root.tsx Shell): the browser error reporter (T-D01), the page-type dimension the
 * old ReaderApp set (T-D04), web vitals when remote config turns them on (T-D03), and the kill switch's client half (T-C03).
 * Renders nothing.
 *
 * @feature ANL-017 Browser error reporting
 */
import { useEffect, useRef } from "react";
import { useLocation, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PUBLIC_CONFIG } from "~/lib/config";
import { legacyPageType, setPageTypeDimension, startWebVitals, uaEvent, vitalsEnabled } from "~/lib/analytics";
import { ErrorReporter, pageReporter, setPageReporter } from "~/lib/monitoring/error-reporter";
import { routeKind } from "~/lib/monitoring/route-kind";
import { remoteConfigQueryOptions } from "~/lib/shell/remote-config";
import { applyKillSwitch } from "./reader-choice";

const PHONE = "(max-width: 842px)";

/** Install the page's reporter (idempotent: one per document). Exported for tests. */
export function installErrorReporter(signedIn: () => boolean): () => void {
  if (pageReporter()) return () => {};
  const reporter = new ErrorReporter({
    endpoint: PUBLIC_CONFIG.errorEndpoint,
    release: PUBLIC_CONFIG.analytics.appVersion,
    sampleRate: PUBLIC_CONFIG.errorSampleRate,
    signedIn,
  });
  setPageReporter(reporter);
  const uninstall = reporter.enabled ? reporter.install(window) : () => {};
  // the old track.js window.onerror: a "Javascript Errors" event through GTM's ga shim (only when the shim is there, as before)
  const legacy = (e: ErrorEvent) => {
    if (e instanceof ErrorEvent) uaEvent("Javascript Errors", e.message, `${e.filename}:${e.lineno}`);
  };
  window.addEventListener("error", legacy);
  return () => {
    uninstall();
    window.removeEventListener("error", legacy);
    setPageReporter(null);
  };
}

export function Monitoring({ signedIn }: { signedIn: boolean }) {
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  useEffect(() => installErrorReporter(() => signedInRef.current), []);

  // dimension5, re-set whenever the page changes (ReaderApp.trackPageview on every history push)
  const loc = useLocation();
  const matches = useMatches();
  const book = (matches.find((m) => m.routeId === "/$")?.loaderData as { kind?: string } | undefined)?.kind === "book";
  const search = loc.search as Record<string, unknown>;
  const sidebar = search?.with !== undefined && search?.with !== null && search?.with !== "";
  useEffect(() => {
    const phone = typeof window.matchMedia === "function" && window.matchMedia(PHONE).matches;
    setPageTypeDimension(legacyPageType(loc.pathname, { book, phone, sidebar }));
  }, [loc.pathname, book, sidebar]);

  // the remote-config switches the root loader already fetched (dehydrated into the page: no extra request)
  const remote = useQuery(remoteConfigQueryOptions()).data;
  useEffect(() => {
    if (remote) applyKillSwitch(remote);
  }, [remote]);

  const vitalsStarted = useRef(false);
  const kindRef = useRef(routeKind(loc.pathname));
  kindRef.current = routeKind(loc.pathname);
  useEffect(() => {
    if (vitalsStarted.current || !remote || !vitalsEnabled(remote)) return;
    vitalsStarted.current = true;
    // the page type of the page the reader is on when a metric is sent
    startWebVitals(() => kindRef.current);
  }, [remote]);
  return null;
}
