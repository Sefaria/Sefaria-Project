import { makeUuid } from './utils.js';

/**
 * Sign-up funnel analytics (spec: sign_up_flow_started / sign_up_method_chosen /
 * sign_up_process_started / sign_up_process_ended / sign_up_flow_ended), fired for
 * every sign-up method (email, Google, Apple, Google One Tap) via GA4 gtag events.
 *
 * Pure helpers only — see useSignUpTracking.js for the AuthPage-facing hook.
 */
export const SIGNUP_EVENT = {
  FLOW_STARTED: 'sign_up_flow_started',
  METHOD_CHOSEN: 'sign_up_method_chosen',
  PROCESS_STARTED: 'sign_up_process_started',
  PROCESS_ENDED: 'sign_up_process_ended',
  FLOW_ENDED: 'sign_up_flow_ended',
};

export const SIGNUP_METHOD = { EMAIL: 'email', GOOGLE: 'google', APPLE: 'apple', GOOGLE_ONE_TAP: 'google_one_tap' };

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

export function fireFlowStarted(flowId, source) {
  sendEvent(SIGNUP_EVENT.FLOW_STARTED, { flow_id: flowId, source });
}
export function fireMethodChosen(flowId, attemptId, method) {
  sendEvent(SIGNUP_EVENT.METHOD_CHOSEN, { flow_id: flowId, attempt_id: attemptId, method });
}
export function fireProcessStarted(flowId, attemptId) {
  sendEvent(SIGNUP_EVENT.PROCESS_STARTED, { flow_id: flowId, attempt_id: attemptId });
}
export function fireProcessEnded(flowId, attemptId, status, error = null) {
  sendEvent(SIGNUP_EVENT.PROCESS_ENDED, { flow_id: flowId, attempt_id: attemptId, status, error });
}
export function fireFlowEnded(flowId, status, error = null) {
  sendEvent(SIGNUP_EVENT.FLOW_ENDED, { flow_id: flowId, status, error });
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
// redirect, by any mechanism. Only success lands somewhere our JS loads again (Apple:
// the original `next` URL, honored; Google: always `home`, a separate pre-existing bug
// that ignores `next`). That means reaching either resumption branch below is
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

function clearPendingAttempt() {
  try { sessionStorage.removeItem(PENDING_ATTEMPT_KEY); } catch (e) { /* noop */ }
}

// Google: the button lives in a cross-origin iframe with no click signal at all, so
// there's no attemptId to persist ahead of time — only the flowId, written whenever a
// /register flow starts (see useSignUpTracking's startFlow), cleared whenever it ends
// through any means we *can* observe (in-app nav, popstate, unmount). If it's still
// present on a later page load AND that load's referrer is accounts.google.com, that's
// the Google-redirect success we could never see coming — synthesize the whole
// method_chosen/process_started/process_ended/flow_ended burst retroactively.
const ACTIVE_FLOW_KEY = 'sefaria_active_signup_flow';

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

// Called once per full page load (from ReaderApp), regardless of whether the page
// happens to be /register itself.
export function resumePendingSignUpAttempt() {
  const pendingAttempt = readPendingAttempt();
  if (pendingAttempt) {
    clearPendingAttempt();
    clearActiveFlow();
    const fromProvider = document.referrer.startsWith(SSO_REFERRER_ORIGIN.APPLE)
      || document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE);
    const status = fromProvider ? 'success' : 'failure';
    const error = fromProvider ? null : 'unexpected_return_without_provider_referrer';
    fireProcessEnded(pendingAttempt.flowId, pendingAttempt.attemptId, status, error);
    fireFlowEnded(pendingAttempt.flowId, status, error);
    return;
  }

  // No Apple marker: either nothing SSO happened, or it was Google, which never writes one.
  // activeFlow is the generic "a /register flow was in progress" marker, our only way to
  // attach a synthesized Google attempt to a flowId.
  const activeFlow = readActiveFlow();
  if (!activeFlow) return;
  if (!document.referrer.startsWith(SSO_REFERRER_ORIGIN.GOOGLE)) return; // not (yet) a Google-redirect return; leave it for its own max-age to expire
  clearActiveFlow();
  const attemptId = makeUuid();
  fireMethodChosen(activeFlow.flowId, attemptId, SIGNUP_METHOD.GOOGLE);
  fireProcessStarted(activeFlow.flowId, attemptId);
  fireProcessEnded(activeFlow.flowId, attemptId, 'success', null);
  fireFlowEnded(activeFlow.flowId, 'success', null);
}
