import { useEffect } from 'react';
import { useLocation, useRouteError } from 'react-router';

/** True after at least one client-side navigation (React Router keeps the history index in its state). */
function navigatedInApp(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return (state?.idx ?? 0) > 0;
}

/**
 * A client-side navigation whose payload could not be loaded (network error, a non-payload answer).
 * The server can still render the page, so this falls back to a full page load of the same URL. On the
 * first page (no client-side navigation yet) it only shows the link, so it can never loop.
 */
export function RouteError() {
  const error = useRouteError();
  const location = useLocation();
  const href = location.pathname + location.search + location.hash;
  useEffect(() => {
    console.error('devportal: could not load page data', error);
    if (navigatedInApp()) window.location.assign(href);
  }, [error, href]);
  return (
    <p className="dp-route-error" role="alert">
      This page could not be loaded. <a href={href}>Try again</a>
    </p>
  );
}
