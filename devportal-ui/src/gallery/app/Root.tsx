import { useState } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { initAnalytics, initGa4 } from '../lib/analytics';
import { GalleryOptionsProvider, type GalleryOptions } from './GalleryContext';
import { RouteEffects } from './RouteEffects';
import '../styles/tokens.css';
import '../styles/reset.css';
import '../styles/global.css';

/**
 * The element of the `/powered-by` route. Analytics start here, on the first gallery page, rather than at
 * import time: the portal bundles the gallery with every other page, and only gallery pages report to the
 * gallery's properties. Both calls are idempotent; they run before the first render of the children so the
 * footer's privacy line is right on the first paint, as when the gallery's main.tsx called them.
 */
export function Root({ options = {} }: { options?: GalleryOptions }) {
  useState(() => {
    initAnalytics();
    initGa4(options.ga4Id);
    return null;
  });
  return (
    <GalleryOptionsProvider value={options}>
      <Outlet />
      <RouteEffects />
      {options.scrollRestoration !== false && <ScrollRestoration />}
    </GalleryOptionsProvider>
  );
}
