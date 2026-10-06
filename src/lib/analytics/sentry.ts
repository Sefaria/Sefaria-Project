/**
 * Browser error reporting, as client.jsx does it: Sentry with tracing and replay, the release = the app version, the sample rates
 * from the client remote config (`feature.client.remote_config_json` → `sentry`, served by GET /api/remote-config; each 0 when
 * missing, so nothing is sent unless configured). Only when CLIENT_SENTRY_DSN is set; the SDK is loaded on demand.
 *
 * @feature ANL-017 Browser error reporting (Sentry)
 */
import { API_ORIGIN, PUBLIC_CONFIG } from "~/lib/config";

interface SentryRates {
  tracesSampleRate?: number;
  sampleRate?: number;
  replaysSessionSampleRate?: number;
  replaysOnErrorSampleRate?: number;
}

export async function sentryRates(signal?: AbortSignal): Promise<SentryRates> {
  try {
    const r = await fetch(`${API_ORIGIN}/api/remote-config`, { signal });
    if (!r.ok) return {};
    const all = (await r.json()) as Record<string, unknown>;
    const client = all["feature.client.remote_config_json"] as { sentry?: SentryRates } | undefined;
    return client?.sentry ?? {};
  } catch {
    return {};
  }
}

let started = false;
export async function initSentry(): Promise<void> {
  const dsn = PUBLIC_CONFIG.analytics.sentryDsn;
  if (started || !dsn || typeof window === "undefined") return;
  started = true;
  const [rates, Sentry] = await Promise.all([sentryRates(), import("@sentry/react")]);
  Sentry.init({
    dsn,
    release: PUBLIC_CONFIG.analytics.appVersion || undefined,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: rates.tracesSampleRate || 0.0,
    sampleRate: rates.sampleRate || 0.0,
    replaysSessionSampleRate: rates.replaysSessionSampleRate || 0.0,
    replaysOnErrorSampleRate: rates.replaysOnErrorSampleRate || 0.0,
  });
}
