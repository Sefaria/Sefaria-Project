/**
 * Sign-up funnel analytics (sign_up_flow_started / sign_up_method_chosen / sign_up_process_started / sign_up_process_ended /
 * sign_up_flow_ended), fired for every sign-up method (email, Google, Apple, Google One Tap). Ported from
 * static/js/auth/signupAnalytics.js: same event names, same parameters, same sessionStorage keys.
 *
 * Everything goes through `trackAuthEvent`, which hands the event to the shared analytics module (src/lib/analytics: gtag, and the
 * in-memory log tests read).
 *
 * @feature ANL-013 Sign-up funnel analytics
 * @feature ANL-002 Sign-up source attribution
 */
import { gtagEvent, type AnalyticsParams } from "~/lib/analytics/core";
import { makeUuid } from "./utils";

export type AuthEventParams = Record<string, unknown>;

/** The single place auth analytics leave this client. */
export function trackAuthEvent(name: string, params: AuthEventParams): void {
  gtagEvent(name, params as AnalyticsParams);
}

export const SIGNUP_EVENT = {
  FLOW_STARTED: "sign_up_flow_started",
  METHOD_CHOSEN: "sign_up_method_chosen",
  PROCESS_STARTED: "sign_up_process_started",
  PROCESS_ENDED: "sign_up_process_ended",
  FLOW_ENDED: "sign_up_flow_ended",
} as const;

export const SIGNUP_METHOD = { EMAIL: "email", GOOGLE: "google", APPLE: "apple", GOOGLE_ONE_TAP: "google_one_tap" } as const;
export type SignupMethod = (typeof SIGNUP_METHOD)[keyof typeof SIGNUP_METHOD];

export const SSO_REFERRER_ORIGIN = { GOOGLE: "https://accounts.google.com", APPLE: "https://appleid.apple.com" } as const;

function sendEvent(name: string, params: AuthEventParams) {
  trackAuthEvent(name, {
    project: "site_registration",
    feature_name: "site_registration_form",
    transport_type: "beacon",
    ...params,
  });
}

export const fireFlowStarted = (flowId: string | null, source: string | null | undefined) =>
  sendEvent(SIGNUP_EVENT.FLOW_STARTED, { flow_id: flowId, source });
export const fireMethodChosen = (flowId: string | null, attemptId: string, method: string) =>
  sendEvent(SIGNUP_EVENT.METHOD_CHOSEN, { flow_id: flowId, attempt_id: attemptId, method });
export const fireProcessStarted = (flowId: string | null, attemptId: string) =>
  sendEvent(SIGNUP_EVENT.PROCESS_STARTED, { flow_id: flowId, attempt_id: attemptId });
export const fireProcessEnded = (flowId: string | null, attemptId: string, status: string, error: string | null = null) =>
  sendEvent(SIGNUP_EVENT.PROCESS_ENDED, { flow_id: flowId, attempt_id: attemptId, status, error });
export const fireFlowEnded = (flowId: string | null, status: string, error: string | null = null) =>
  sendEvent(SIGNUP_EVENT.FLOW_ENDED, { flow_id: flowId, status, error });

// ---- SSO redirect persistence ----------------------------------------------------------------------------------------------
// Google/Apple sign-in on phones is a full-page redirect to the provider, so an attempt in flight survives in sessionStorage and is
// closed out on the next page load. Only success comes back to a page that runs our code (failures land on allauth's own pages),
// so reaching resumePendingSignUpAttempt with a marker means success; document.referrer is checked anyway.
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const PENDING_ATTEMPT_KEY = "sefaria_pending_sso_attempt";
const ACTIVE_FLOW_KEY = "sefaria_active_signup_flow";

interface PendingAttempt {
  flowId: string;
  attemptId: string;
  method: string;
  ts: number;
}

export function persistPendingAttempt({ flowId, attemptId, method }: { flowId: string | null; attemptId: string; method: string }) {
  try {
    sessionStorage.setItem(PENDING_ATTEMPT_KEY, JSON.stringify({ flowId, attemptId, method, ts: Date.now() }));
  } catch {
    /* sessionStorage unavailable (private mode, etc.) */
  }
}

function readPendingAttempt(): PendingAttempt | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ATTEMPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAttempt;
    if (!parsed?.flowId || !parsed?.attemptId || Date.now() - parsed.ts > PENDING_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingAttempt() {
  try {
    sessionStorage.removeItem(PENDING_ATTEMPT_KEY);
  } catch {
    /* noop */
  }
}

export function persistActiveFlow({ flowId }: { flowId: string | null }) {
  try {
    sessionStorage.setItem(ACTIVE_FLOW_KEY, JSON.stringify({ flowId, ts: Date.now() }));
  } catch {
    /* noop */
  }
}

export function clearActiveFlow() {
  try {
    sessionStorage.removeItem(ACTIVE_FLOW_KEY);
  } catch {
    /* noop */
  }
}

function readActiveFlow(): { flowId: string; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { flowId: string; ts: number };
    if (!parsed?.flowId || Date.now() - parsed.ts > PENDING_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Called once per full page load (the old ReaderApp did it on mount), whatever the page. */
export function resumePendingSignUpAttempt() {
  const pendingAttempt = readPendingAttempt();
  if (pendingAttempt) {
    clearPendingAttempt();
    clearActiveFlow();
    const fromProvider = document.referrer.startsWith(SSO_REFERRER_ORIGIN.APPLE) || document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE);
    const status = fromProvider ? "success" : "failure";
    const error = fromProvider ? null : "unexpected_return_without_provider_referrer";
    fireProcessEnded(pendingAttempt.flowId, pendingAttempt.attemptId, status, error);
    fireFlowEnded(pendingAttempt.flowId, status, error);
    return;
  }
  // No Apple marker: nothing happened, or it was Google (which never writes one). The active-flow marker ties a Google return to a flow.
  const activeFlow = readActiveFlow();
  if (!activeFlow) return;
  if (!document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE)) return; // not (yet) a Google return; left for its own max-age
  clearActiveFlow();
  const attemptId = makeUuid();
  fireMethodChosen(activeFlow.flowId, attemptId, SIGNUP_METHOD.GOOGLE);
  fireProcessStarted(activeFlow.flowId, attemptId);
  fireProcessEnded(activeFlow.flowId, attemptId, "success", null);
  fireFlowEnded(activeFlow.flowId, "success", null);
}
