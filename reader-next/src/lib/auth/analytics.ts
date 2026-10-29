/**
 * Auth funnel analytics (auth_flow_started / auth_method_chosen / auth_process_started / auth_process_ended / auth_flow_ended), for
 * login and registration alike, every method (email, Google, Apple, Google One Tap). Ported from master's
 * static/js/auth/authAnalytics.js: same event names, same parameters (flow_intent, outcome), same sessionStorage keys and the
 * sefaria_sso_outcome cookie. (It replaced the sign_up_* funnel of signupAnalytics.js, which this client first ported:
 * CODE_REVIEW R-08 — parity follows master.)
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

export const AUTH_EVENT = {
  FLOW_STARTED: "auth_flow_started",
  METHOD_CHOSEN: "auth_method_chosen",
  PROCESS_STARTED: "auth_process_started",
  PROCESS_ENDED: "auth_process_ended",
  FLOW_ENDED: "auth_flow_ended",
} as const;

export const AUTH_METHOD = { EMAIL: "email", GOOGLE: "google", APPLE: "apple", GOOGLE_ONE_TAP: "google_one_tap" } as const;
export type AuthMethod = (typeof AUTH_METHOD)[keyof typeof AUTH_METHOD];

export const SSO_REFERRER_ORIGIN = { GOOGLE: "https://accounts.google.com", APPLE: "https://appleid.apple.com" } as const;

function sendEvent(name: string, params: AuthEventParams) {
  trackAuthEvent(name, {
    project: "site_registration",
    feature_name: "site_registration_form",
    transport_type: "beacon",
    ...params,
  });
}

/** Which way in the flow started: the register page, the login page, or Google One Tap (master's values). */
export type FlowIntent = "registration" | "login" | "one_tap_login";

/** The sign-in answer's `outcome` ("created_new_account", "existing_user_login"…), when it has one (master's SSO callbacks do). */
export function outcomeOf(data: unknown): string | null {
  const o = (data as { outcome?: unknown } | null)?.outcome;
  return typeof o === "string" && o ? o : null;
}

export const fireFlowStarted = (flowId: string | null, source: string | null | undefined, flowIntent: FlowIntent) =>
  sendEvent(AUTH_EVENT.FLOW_STARTED, { flow_id: flowId, source, flow_intent: flowIntent });
export const fireMethodChosen = (flowId: string | null, attemptId: string, method: string) =>
  sendEvent(AUTH_EVENT.METHOD_CHOSEN, { flow_id: flowId, attempt_id: attemptId, method });
export const fireProcessStarted = (flowId: string | null, attemptId: string) =>
  sendEvent(AUTH_EVENT.PROCESS_STARTED, { flow_id: flowId, attempt_id: attemptId });
export const fireProcessEnded = (flowId: string | null, attemptId: string, status: string, error: string | null = null, outcome: string | null = null) =>
  sendEvent(AUTH_EVENT.PROCESS_ENDED, { flow_id: flowId, attempt_id: attemptId, status, error, outcome });
export const fireFlowEnded = (flowId: string | null, status: string, error: string | null = null, outcome: string | null = null) =>
  sendEvent(AUTH_EVENT.FLOW_ENDED, { flow_id: flowId, status, error, outcome });

// ---- SSO redirect persistence ----------------------------------------------------------------------------------------------
// Google/Apple sign-in on phones is a full-page redirect to the provider, so an attempt in flight survives in sessionStorage and is
// closed out on the next page load. Only success comes back to a page that runs our code (failures land on allauth's own pages),
// so reaching resumePendingAuthAttempt with a marker means success; document.referrer is checked anyway.
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const PENDING_ATTEMPT_KEY = "sefaria_pending_sso_attempt";
const ACTIVE_FLOW_KEY = "sefaria_active_auth_flow";

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

/**
 * Set by Django (sso.adapters, cleared by ClearSsoNextCookieMiddleware) when a redirect-mode SSO flow concludes: the only way to learn
 * "new account or existing" for a flow that left the page. Read once and cleared at once, so it never leaks into a later flow.
 */
const OUTCOME_COOKIE = "sefaria_sso_outcome";

function readAndClearOutcomeCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${OUTCOME_COOKIE}=([^;]*)`));
  if (!match) return null;
  document.cookie = `${OUTCOME_COOKIE}=; path=/; max-age=0; SameSite=None; Secure`;
  try {
    return decodeURIComponent(match[1]!) || null;
  } catch {
    return null;
  }
}

/** Called once per full page load (the old ReaderApp did it on mount), whatever the page. */
export function resumePendingAuthAttempt() {
  const pendingAttempt = readPendingAttempt();
  if (pendingAttempt) {
    clearPendingAttempt();
    clearActiveFlow();
    const fromProvider = document.referrer.startsWith(SSO_REFERRER_ORIGIN.APPLE) || document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE);
    const status = fromProvider ? "success" : "failure";
    const error = fromProvider ? null : "unexpected_return_without_provider_referrer";
    const outcome = fromProvider ? readAndClearOutcomeCookie() : null;
    fireProcessEnded(pendingAttempt.flowId, pendingAttempt.attemptId, status, error, outcome);
    fireFlowEnded(pendingAttempt.flowId, status, error, outcome);
    return;
  }
  // No Apple marker: nothing happened, or it was Google (which never writes one). The active-flow marker ties a Google return to a flow.
  const activeFlow = readActiveFlow();
  if (!activeFlow) return;
  if (!document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE)) return; // not (yet) a Google return; left for its own max-age
  clearActiveFlow();
  const attemptId = makeUuid();
  const outcome = readAndClearOutcomeCookie();
  fireMethodChosen(activeFlow.flowId, attemptId, AUTH_METHOD.GOOGLE);
  fireProcessStarted(activeFlow.flowId, attemptId);
  fireProcessEnded(activeFlow.flowId, attemptId, "success", null, outcome);
  fireFlowEnded(activeFlow.flowId, "success", null, outcome);
}
