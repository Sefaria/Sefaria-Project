// Sentry sampling and global error capture for the client bundle.

// Used when remote config does not set sentry.sampleRate. An explicit value from
// remote config (including 0) always wins.
export const DEFAULT_SENTRY_SAMPLE_RATE = 0.1;

export function resolveSentrySampleRate(remoteSampleRate) {
  return remoteSampleRate ?? DEFAULT_SENTRY_SAMPLE_RATE;
}

// Reports uncaught errors and unhandled promise rejections to Sentry. Uses
// addEventListener so it never replaces a window.onerror handler set elsewhere.
// Sentry drops the report when it is not initialized, so this is safe to call
// unconditionally.
export function installGlobalErrorCapture(win, sentry) {
  win.addEventListener('error', (event) => {
    sentry.captureException(event.error ?? event.message);
  });
  win.addEventListener('unhandledrejection', (event) => {
    sentry.captureException(event.reason);
  });
}
