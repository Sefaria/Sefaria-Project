/**
 * The browser's error reporter, installed when this module loads (src/router.tsx imports it), i.e. before React hydrates: errors in
 * hydration, React 19's recovered hydration mismatches (window.reportError right after the commit) and the first effects' errors all
 * reach it. What the page knows later (who is signed in) goes into `pageContext`, which src/features/shell/Monitoring.tsx updates.
 *
 * @feature ANL-017 Browser error reporting
 */
import { PUBLIC_CONFIG } from "~/lib/config";
import { ErrorReporter, pageReporter, setPageReporter } from "./error-reporter";

/** Mutable page facts read at report time. */
export const pageContext: { signedIn: boolean } = { signedIn: false };

export interface MonitoringConfig {
  errorEndpoint?: string | null;
  errorSampleRate?: number;
  release?: string | null;
}

/** Install the page's reporter on `target` (once per document). Returns the reporter (null on the server). */
export function installPageMonitoring(target: Pick<Window, "addEventListener" | "removeEventListener"> | undefined = typeof window !== "undefined" ? window : undefined, cfg: MonitoringConfig = { errorEndpoint: PUBLIC_CONFIG.errorEndpoint, errorSampleRate: PUBLIC_CONFIG.errorSampleRate, release: PUBLIC_CONFIG.analytics.appVersion }): ErrorReporter | null {
  if (!target) return null;
  const existing = pageReporter();
  if (existing) return existing;
  const reporter = new ErrorReporter({ endpoint: cfg.errorEndpoint, release: cfg.release, sampleRate: cfg.errorSampleRate, signedIn: () => pageContext.signedIn });
  setPageReporter(reporter);
  if (reporter.enabled) reporter.install(target);
  return reporter;
}

if (typeof window !== "undefined") installPageMonitoring();
