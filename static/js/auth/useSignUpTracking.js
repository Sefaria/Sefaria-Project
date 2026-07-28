import { useEffect, useRef } from 'react';
import { makeUuid } from './utils.js';
import {
  persistActiveFlow, clearActiveFlow,
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
  // Continuously reflects "mobile SSO redirect is live on this page" (set by
  // useSsoSignIn.jsx) — not a one-shot pre-navigation flag. Google's redirect button
  // gives no click signal at all, so there's no way to tell *which* beforeunload is the
  // SSO one; while it's live, beforeunload is suppressed entirely and the flow's fate is
  // resolved later by resumePendingSignUpAttempt (via a persisted flowId + checking
  // document.referrer on the next page load). popstate is unaffected — going back is
  // never a redirect-to-provider, so it always still concludes the flow normally.
  const suppressFlowEndRef = useRef(false);

  function startFlow(src) {
    flowIdRef.current = makeUuid();
    attemptRef.current = null;
    flowEndedRef.current = false;
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
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  // Unmount-cleanup: ReaderApp.openURL can unmount AuthPage via a pure SPA
  // transition (showAuth:false) with no beforeunload/popstate ever firing.
  useEffect(() => endFlow, []);

  return {
    chooseMethod, startProcess, endProcess, getIds, suppressFlowEndRef,
  };
}
