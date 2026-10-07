/**
 * Drives the sign-up funnel for the auth page: flow start on arriving at /register (any sub-view), method/process events, flow end on
 * leaving (flow change, popstate, beforeunload unless an SSO redirect is in flight, bfcache restore, unmount). Ported from
 * static/js/auth/useSignUpTracking.js, same behaviour.
 *
 * @feature ANL-013 Sign-up funnel analytics
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { makeUuid, type AuthFlow } from "./utils";
import {
  clearActiveFlow,
  clearPendingAttempt,
  fireFlowEnded,
  fireFlowStarted,
  fireMethodChosen,
  fireProcessEnded,
  fireProcessStarted,
  persistActiveFlow,
} from "./analytics";

interface Attempt {
  attemptId: string;
  method: string;
  started: boolean;
  ended: boolean;
  status: string | null;
  error: string | null;
}

export interface SignUpTracking {
  chooseMethod: (method: string) => string;
  startProcess: () => void;
  endProcess: (status: string, error?: string | null) => void;
  getIds: () => { flowId: string | null };
  /** Set right before an SSO redirect navigates away, so that beforeunload does not end the flow. */
  suppressFlowEndRef: MutableRefObject<boolean>;
}

/**
 * @param flow   the auth page's flow
 * @param source the control that led here (nav_bar, login_prompt, signup_modal_*, login_crosslink …), from data-signup-source
 */
export function useSignUpTracking({ flow, source }: { flow: AuthFlow; source?: string | null }): SignUpTracking {
  const flowIdRef = useRef<string | null>(null);
  const attemptRef = useRef<Attempt | null>(null);
  const flowEndedRef = useRef(true);
  const prevIsRegisterRef = useRef(false);
  const suppressFlowEndRef = useRef(false);

  function startFlow(src: string | null | undefined) {
    flowIdRef.current = makeUuid();
    attemptRef.current = null;
    flowEndedRef.current = false;
    suppressFlowEndRef.current = false; // a fresh flow never starts pre-suppressed
    persistActiveFlow({ flowId: flowIdRef.current });
    fireFlowStarted(flowIdRef.current, src);
  }

  function endProcess(status: string, error: string | null = null) {
    const attempt = attemptRef.current;
    if (!attempt || attempt.ended) return;
    attempt.ended = true;
    attempt.status = status;
    attempt.error = error;
    fireProcessEnded(flowIdRef.current, attempt.attemptId, status, error);
  }

  function chooseMethod(method: string) {
    // close whatever attempt is still open first, so none is ever silently dropped
    endProcess("failure", "abandoned_for_new_attempt");
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

  function endFlow() {
    if (flowEndedRef.current) return;
    flowEndedRef.current = true;
    clearActiveFlow();
    // a redirect marker for this flow is moot once it is concluded; left in place a later page load could double-report it
    clearPendingAttempt();
    const attempt = attemptRef.current;
    if (attempt?.started && !attempt.ended) endProcess("failure", "left_page");
    const status = attempt?.status || "failure";
    const error = attempt?.error ?? (attempt ? null : "no_attempt");
    fireFlowEnded(flowIdRef.current, status, error);
  }

  const getIds = () => ({ flowId: flowIdRef.current });

  // once per arrival at /register (any sub-view), once on departure
  useEffect(() => {
    const isRegister = flow === "register";
    const wasRegister = prevIsRegisterRef.current;
    prevIsRegisterRef.current = isRegister;
    if (isRegister && !wasRegister) startFlow(source);
    else if (!isRegister && wasRegister) endFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, source]);

  useEffect(() => {
    if (flow !== "register") return;
    const onBeforeUnload = () => {
      if (suppressFlowEndRef.current) return;
      endFlow();
    };
    const onPopState = () => endFlow();
    // persisted: this exact document came back from the back-forward cache (e.g. Back from the provider's page) — a redirect
    // that had been in flight did not succeed. Still on /register, so a fresh flow is re-armed.
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      const attempt = attemptRef.current;
      if (attempt?.started && !attempt.ended) endProcess("failure", "back_navigation");
      endFlow();
      startFlow(source);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, source]);

  // unmount (an in-app navigation away) concludes the flow too
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => endFlow, []);

  return { chooseMethod, startProcess, endProcess, getIds, suppressFlowEndRef };
}
