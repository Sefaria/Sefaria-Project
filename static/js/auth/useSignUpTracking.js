import { useEffect, useRef } from 'react';
import { makeUuid } from './utils.js';
import {
  persistActiveFlow, clearActiveFlow, clearPendingAttempt,
  fireFlowStarted, fireMethodChosen, fireProcessStarted, fireProcessEnded, fireFlowEnded,
} from './signupAnalytics.js';

/**
 * Drives the sign_up_flow_started/method_chosen/process_started/process_ended/
 * flow_ended funnel for AuthPage. Owned by AuthPage, passed down into
 * RegisterView and useSsoSignIn.
 *
 * @param flow   'login' | 'register' | 'reset' — AuthPage's `pathToFlow(initialPath)`.
 * @param source the CTA that led here (nav_bar, login_prompt, signup_modal_*,
 *               login_crosslink, ...) — AuthPage's `authSource` prop, ultimately
 *               read off a `data-signup-source` DOM attribute by ReaderApp.
 */
export function useSignUpTracking({ flow, source }) {
  const flowIdRef = useRef(null);
  const attemptRef = useRef(null);
  const flowEndedRef = useRef(true);
  const prevIsRegisterRef = useRef(false);
  // Set precisely at click time by useSsoSignIn.jsx (both Google's click_listener and
  // Apple's triggerApple) right before a mobile SSO redirect navigates away, so the
  // beforeunload that follows isn't mistaken for an ordinary abandoned visit — the flow's
  // fate is instead resolved later, either by resumePendingSignUpAttempt (a persisted
  // attempt + checking document.referrer on the next page load) or by the pageshow/bfcache
  // handler below if the user comes back via Back instead of completing the redirect.
  // Reset back to false at the start of every new flow (startFlow) so it never survives
  // into an attempt it wasn't set for. popstate is unaffected — going back within the app
  // (not to/from a provider) always still concludes the flow normally.
  const suppressFlowEndRef = useRef(false);

  function startFlow(src) {
    flowIdRef.current = makeUuid();
    attemptRef.current = null;
    flowEndedRef.current = false;
    // A prior attempt (this flow or an earlier one on the same mount) may have left this
    // suppressed for a redirect that's now over — a fresh flow must never start pre-suppressed.
    suppressFlowEndRef.current = false;
    persistActiveFlow({ flowId: flowIdRef.current });
    fireFlowStarted(flowIdRef.current, src);
  }

  function chooseMethod(method) {
    // Close out whatever attempt is still open first (e.g. the user's email
    // submit came back "you already have a Google account" and they clicked
    // "Continue with Google" — the email attempt should already be ended by
    // its own error branch, but this guards against any attempt still in
    // flight when a new method is chosen, so we never silently drop one).
    endProcess('failure', 'abandoned_for_new_attempt');
    const attemptId = makeUuid();
    attemptRef.current = { attemptId, method, started: false, ended: false, status: null, error: null };
    fireMethodChosen(flowIdRef.current, attemptId, method);
    return attemptId;
  }

  function startProcess() {
    const attempt = attemptRef.current;
    if (!attempt || attempt.started) return;
    attempt.started = true;
    fireProcessStarted(flowIdRef.current, attempt.attemptId);
  }

  function endProcess(status, error = null) {
    const attempt = attemptRef.current;
    if (!attempt || attempt.ended) return;
    attempt.ended = true;
    attempt.status = status;
    attempt.error = error;
    fireProcessEnded(flowIdRef.current, attempt.attemptId, status, error);
  }

  function endFlow() {
    if (flowEndedRef.current) return;
    flowEndedRef.current = true;
    clearActiveFlow();
    // Any not-yet-resolved redirect marker for this flow is moot once it's concluded by any
    // means — left in place, it could otherwise be picked up by a later, unrelated page load's
    // resumePendingSignUpAttempt() within its 10-minute window and double-reported as a failure.
    clearPendingAttempt();
    const attempt = attemptRef.current;
    if (attempt?.started && !attempt.ended) {
      endProcess('failure', 'left_page');
    }
    const status = attempt?.status || 'failure';
    const error = attempt?.error ?? (attempt ? null : 'no_attempt');
    fireFlowEnded(flowIdRef.current, status, error);
  }

  function getIds() {
    return { flowId: flowIdRef.current };
  }

  // Flow-transition effect: fires once per arrival at /register (any sub-view),
  // and once on departure — independent of which view (choose/email/etc) is showing.
  useEffect(() => {
    const isRegister = flow === 'register';
    const wasRegister = prevIsRegisterRef.current;
    prevIsRegisterRef.current = isRegister;
    if (isRegister && !wasRegister) {
      startFlow(source);
    } else if (!isRegister && wasRegister) {
      endFlow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, source]);

  // beforeunload can be suppressed (mobile SSO redirect may be in flight — resolved
  // later via resumePendingSignUpAttempt); popstate never is.
  useEffect(() => {
    if (flow !== 'register') return;
    const onBeforeUnload = () => {
      if (suppressFlowEndRef.current) return;
      endFlow();
    };
    const onPopState = () => endFlow();
    // persisted:true fires only when this exact document is restored from the back-forward
    // cache after a real navigation away and back (e.g. Back from Google/Apple's page). A
    // successful SSO redirect never returns to this exact document that way — success lands
    // on a different callback URL instead — so reaching this handler at all already proves
    // whatever redirect was in flight did not succeed. That's why, unlike beforeunload, it
    // doesn't check suppressFlowEndRef: checking it here would just recreate the original
    // "which departure was the SSO one" problem for the one case where we now actually know
    // the answer. Still on /register, so re-arm a fresh flow for whatever happens next.
    const onPageShow = (e) => {
      if (!e.persisted) return;
      const attempt = attemptRef.current;
      if (attempt?.started && !attempt.ended) {
        endProcess('failure', 'back_navigation');
      }
      endFlow();
      startFlow(source);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('pageshow', onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, source]);

  // Unmount-cleanup: ReaderApp.openURL can unmount AuthPage via a pure SPA
  // transition (showAuth:false) with no beforeunload/popstate ever firing.
  useEffect(() => endFlow, []);

  return {
    chooseMethod, startProcess, endProcess, getIds, suppressFlowEndRef,
  };
}
