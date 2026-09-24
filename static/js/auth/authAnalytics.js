import { makeUuid } from './utils.js';

/**
 * Auth funnel analytics (spec: auth_flow_started / auth_method_chosen /
 * auth_process_started / auth_process_ended / auth_flow_ended), fired for
 * every login/register method (email, Google, Apple, Google One Tap) via GA4 gtag events.
 *
 * Pure helpers only — see useAuthTracking.js for the AuthPage-facing hook.
 */
export const AUTH_EVENT = {
  FLOW_STARTED: 'auth_flow_started',
  METHOD_CHOSEN: 'auth_method_chosen',
  PROCESS_STARTED: 'auth_process_started',
  PROCESS_ENDED: 'auth_process_ended',
  FLOW_ENDED: 'auth_flow_ended',
};

export const AUTH_METHOD = { EMAIL: 'email', GOOGLE: 'google', APPLE: 'apple', GOOGLE_ONE_TAP: 'google_one_tap' };

export const SSO_REFERRER_ORIGIN = { GOOGLE: 'https://accounts.google.com', APPLE: 'https://appleid.apple.com' };

function sendEvent(name, params) {
  if (typeof window?.gtag !== 'function') return;
  window.gtag('event', name, {
    project: 'site_registration',
    feature_name: 'site_registration_form',
    transport_type: 'beacon',
    ...params,
  });
}

export function fireFlowStarted(flowId, source, flowIntent) {
  sendEvent(AUTH_EVENT.FLOW_STARTED, { flow_id: flowId, source, flow_intent: flowIntent });
}
export function fireMethodChosen(flowId, attemptId, method) {
  sendEvent(AUTH_EVENT.METHOD_CHOSEN, { flow_id: flowId, attempt_id: attemptId, method });
}
export function fireProcessStarted(flowId, attemptId) {
  sendEvent(AUTH_EVENT.PROCESS_STARTED, { flow_id: flowId, attempt_id: attemptId });
}
export function fireProcessEnded(flowId, attemptId, status, error = null, outcome = null) {
  sendEvent(AUTH_EVENT.PROCESS_ENDED, { flow_id: flowId, attempt_id: attemptId, status, error, outcome });
}
export function fireFlowEnded(flowId, status, error = null, outcome = null) {
  sendEvent(AUTH_EVENT.FLOW_ENDED, { flow_id: flowId, status, error, outcome });
}

// ---- mobile SSO redirect persistence -------------------------------------
// Google/Apple SSO on mobile does a real full-page redirect to the provider,
// unmounting React entirely, so any in-flight attempt has to survive in
// sessionStorage to be closed out on the next page load.
//
// Traced against this repo's actual allauth wiring (sso/views.py + django-allauth's
// OAuth2CallbackView/LoginByTokenView): failure or a cancelled sign-in on EITHER
// provider always lands on allauth's bare default templates (authentication_error.html /
// login_cancelled.html), which extend allauth's own generic layout and never load
// Sefaria's JS bundle at all — so our code cannot run, at all, on a failed/cancelled
// redirect, by any mechanism. Only success lands somewhere our JS loads again — the
// original `next` URL for both providers (Google via the sefaria_sso_next cookie, see
// sso/adapters.py; Apple via allauth's own OAuth2 `state`). That means reaching either
// resumption branch below is
// structurally only possible on success — `document.referrer` is checked anyway as
// cheap defense-in-depth, not because failure could otherwise reach here.
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

// Apple: triggerApple() gets a real synchronous click, so we persist a precise
// {flowId, attemptId, method} right before the redirect.
const PENDING_ATTEMPT_KEY = 'sefaria_pending_sso_attempt';

export function persistPendingAttempt({ flowId, attemptId, method }) {
  try {
    sessionStorage.setItem(PENDING_ATTEMPT_KEY, JSON.stringify({ flowId, attemptId, method, ts: Date.now() }));
  } catch (e) { /* sessionStorage unavailable (private mode, etc.) */ }
}

function readPendingAttempt() {
  try {
    const raw = sessionStorage.getItem(PENDING_ATTEMPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.flowId || !parsed?.attemptId || Date.now() - parsed.ts > PENDING_MAX_AGE_MS) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function clearPendingAttempt() {
  try { sessionStorage.removeItem(PENDING_ATTEMPT_KEY); } catch (e) { /* noop */ }
}

// Google: the button lives in a cross-origin iframe with no click signal at all, so
// there's no attemptId to persist ahead of time — only the flowId, written whenever a
// login/register flow starts (see useAuthTracking's startFlow), cleared whenever it ends
// through any means we *can* observe (in-app nav, popstate, unmount). If it's still
// present on a later page load AND that load's referrer is accounts.google.com, that's
// the Google-redirect success we could never see coming — synthesize the whole
// method_chosen/process_started/process_ended/flow_ended burst retroactively.
const ACTIVE_FLOW_KEY = 'sefaria_active_auth_flow';

export function persistActiveFlow({ flowId }) {
  try {
    sessionStorage.setItem(ACTIVE_FLOW_KEY, JSON.stringify({ flowId, ts: Date.now() }));
  } catch (e) { /* noop */ }
}

export function clearActiveFlow() {
  try { sessionStorage.removeItem(ACTIVE_FLOW_KEY); } catch (e) { /* noop */ }
}

function readActiveFlow() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.flowId || Date.now() - parsed.ts > PENDING_MAX_AGE_MS) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

// Set by sso.adapters.SefariaAccountAdapter.get_login_redirect_url/get_signup_redirect_url
// (via sefaria.system.middleware.ClearSsoNextCookieMiddleware) whenever a redirect-mode SSO
// flow (mobile web) concludes — the only way React can learn "new account or existing" for a
// flow that unmounted entirely for a full-page round trip to the provider. Read once and
// cleared immediately so it can never leak into an unrelated later flow.
const OUTCOME_COOKIE = 'sefaria_sso_outcome';

function readAndClearOutcomeCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${OUTCOME_COOKIE}=([^;]*)`));
  if (!match) return null;
  document.cookie = `${OUTCOME_COOKIE}=; path=/; max-age=0; SameSite=None; Secure`;
  try { return decodeURIComponent(match[1]) || null; } catch (e) { return null; }
}

// Called once per full page load (from ReaderApp), regardless of whether the page
// happens to be /register itself.
export function resumePendingAuthAttempt() {
  const pendingAttempt = readPendingAttempt();
  if (pendingAttempt) {
    clearPendingAttempt();
    clearActiveFlow();
    const fromProvider = document.referrer.startsWith(SSO_REFERRER_ORIGIN.APPLE)
      || document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE);
    const status = fromProvider ? 'success' : 'failure';
    const error = fromProvider ? null : 'unexpected_return_without_provider_referrer';
    const outcome = fromProvider ? readAndClearOutcomeCookie() : null;
    fireProcessEnded(pendingAttempt.flowId, pendingAttempt.attemptId, status, error, outcome);
    fireFlowEnded(pendingAttempt.flowId, status, error, outcome);
    return;
  }

  // No Apple marker: either nothing SSO happened, or it was Google, which never writes one.
  // activeFlow is the generic "a login/register flow was in progress" marker, our only way to
  // attach a synthesized Google attempt to a flowId.
  const activeFlow = readActiveFlow();
  if (!activeFlow) return;
  if (!document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE)) return; // not (yet) a Google-redirect return; leave it for its own max-age to expire
  clearActiveFlow();
  const attemptId = makeUuid();
  const outcome = readAndClearOutcomeCookie();
  fireMethodChosen(activeFlow.flowId, attemptId, AUTH_METHOD.GOOGLE);
  fireProcessStarted(activeFlow.flowId, attemptId);
  fireProcessEnded(activeFlow.flowId, attemptId, 'success', null, outcome);
  fireFlowEnded(activeFlow.flowId, 'success', null, outcome);
}
