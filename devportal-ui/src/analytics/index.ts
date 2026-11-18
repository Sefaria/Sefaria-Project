// src/analytics (PLAN §2.13, contract C8): the gtag loader, page views and the key events.
// Wiring (Integrator): call `startAnalytics({ data, router })` once in src/app/mount.tsx, after the
// router is created. Components report key events with `track(...)`; Discord links carry
// `data-discord-cta="<placement>"`.
export * from './events';
export { ANALYTICS_EVENT, DISCORD_CTA_ATTRIBUTE, sanitizeEvent, track, type KeyEventName } from './track';
export { GALLERY_SECTION, GTAG_SRC, loadGtag, measurementId, type Gtag } from './gtag';
export {
  installDiscordTracking,
  startAnalytics,
  type RouterLike,
  type StartAnalyticsOptions,
  type StopAnalytics,
} from './analytics';
