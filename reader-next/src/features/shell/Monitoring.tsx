/**
 * The shell's watchers, mounted once (src/routes/__root.tsx Shell): keeps the error reporter's page facts current (the reporter
 * itself is installed before hydration: src/lib/monitoring/browser.ts), web vitals when remote config turns them on, and the
 * kill switch's client half. Renders nothing.
 *
 * @feature ANL-017 Browser error reporting
 */
import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { startWebVitals, vitalsEnabled } from "~/lib/analytics";
import { pageContext } from "~/lib/monitoring/browser";
import { routeKind } from "~/lib/monitoring/route-kind";
import { remoteConfigQueryOptions } from "~/lib/shell/remote-config";
import { applyKillSwitch } from "./reader-choice";

/** The page load's web-vitals sample, drawn once (a refetched remote config must not draw again). */
const vitalsDraw = typeof window !== "undefined" ? Math.random() : 1;

export function Monitoring({ signedIn }: { signedIn: boolean }) {
  pageContext.signedIn = signedIn;

  // the remote-config switches the root loader already fetched (dehydrated into the page: no extra request)
  const remote = useQuery(remoteConfigQueryOptions()).data;
  useEffect(() => {
    if (remote) applyKillSwitch(remote);
  }, [remote]);

  const loc = useLocation();
  const vitalsStarted = useRef(false);
  const kindRef = useRef(routeKind(loc.pathname));
  kindRef.current = routeKind(loc.pathname);
  useEffect(() => {
    if (vitalsStarted.current || !remote || !vitalsEnabled(remote, () => vitalsDraw)) return;
    vitalsStarted.current = true;
    // the page type of the page the reader is on when a metric is sent
    startWebVitals(() => kindRef.current);
  }, [remote]);
  return null;
}
