/**
 * Google One Tap for signed-out readers, at most once per session, never on /login or /register, not over a cookie notice or a
 * dialog. Ported from static/js/auth/GoogleOneTap.jsx (same session key, 1.2s delay, re-check, analytics burst on the credential
 * callback, reload on success).
 *
 * @feature ACC-002 Google One Tap sign-in
 * @feature ACC-013 Google One Tap
 * @feature ANL-013 Sign-up funnel analytics
 */
import { useEffect } from "react";
import { fireFlowEnded, fireFlowStarted, fireMethodChosen, fireProcessEnded, fireProcessStarted, SIGNUP_METHOD } from "~/lib/auth/analytics";
import { ensureCsrfToken } from "~/lib/auth/csrf";
import { sameOrigin } from "~/lib/auth/http";
import { ALLAUTH_PROVIDER_TOKEN_URL, makeUuid } from "~/lib/auth/utils";

const AUTH_PATHS = new Set(["/login", "/register"]);
const SESSION_KEY = "sefaria_interruptive_ui_shown";
/** The old selectors, plus this client's cookie notice and dialogs. */
const INTERRUPTIVE = ['.cookiesNotification', '.siteWideBanner:not(.hidden)', '.modal', '[role="dialog"][aria-modal="true"]', "[data-interruptive-ui]", "dialog[open]"];

const wasShown = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return true;
  }
};
const markShown = () => {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* noop */
  }
};
const isAuthPath = () => AUTH_PATHS.has(window.location.pathname.replace(/\/$/, ""));
const hasInterruptiveUI = () => INTERRUPTIVE.some((s) => !!document.querySelector(s));

export function useGoogleOneTap({ googleClientId, enabled, reload = () => window.location.reload() }: { googleClientId?: string; enabled: boolean; reload?: () => void }) {
  useEffect(() => {
    if (!enabled || !googleClientId) return;
    if (isAuthPath()) return;
    if (wasShown()) return;

    // The funnel fires when the credential arrives (the reader picked an account), not when Google chooses to display the prompt.
    const handleCredential = async (response: { credential: string }, flowId: string, attemptId: string) => {
      fireFlowStarted(flowId, "one_tap");
      fireMethodChosen(flowId, attemptId, SIGNUP_METHOD.GOOGLE_ONE_TAP);
      fireProcessStarted(flowId, attemptId);
      try {
        const r = await fetch(sameOrigin(ALLAUTH_PROVIDER_TOKEN_URL), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRFToken": await ensureCsrfToken() },
          body: JSON.stringify({ provider: "google", process: "login", token: { client_id: googleClientId, id_token: response.credential } }),
        });
        const data = r.ok ? null : ((await r.json().catch(() => ({}))) as { error?: string });
        const status = data ? "failure" : "success";
        const error = data ? data.error || "unknown" : null;
        fireProcessEnded(flowId, attemptId, status, error);
        fireFlowEnded(flowId, status, error);
        if (data) console.error("Google One Tap failed", data);
        else reload();
      } catch (err) {
        fireProcessEnded(flowId, attemptId, "failure", "network_error");
        fireFlowEnded(flowId, "failure", "network_error");
        console.error("Google One Tap error", err);
      }
    };

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const initOneTap = () => {
      timeoutId = setTimeout(() => {
        // re-check: an in-app navigation to /login or /register may have happened during the delay
        if (isAuthPath()) return;
        if (hasInterruptiveUI()) {
          markShown();
          return;
        }
        const id = window.google?.accounts?.id;
        if (!id) return;
        const flowId = makeUuid();
        const attemptId = makeUuid();
        id.initialize({ client_id: googleClientId, callback: (resp: { credential: string }) => handleCredential(resp, flowId, attemptId) });
        // a listener is required: without one GIS's FedCM path silently drops the credential (verified on the old site 2026-08-10)
        id.prompt(() => {});
        markShown();
      }, 1200);
    };

    if (window.google?.accounts) {
      initOneTap();
      return () => clearTimeout(timeoutId);
    }
    window.addEventListener("google-identity-loaded", initOneTap, { once: true });
    return () => {
      window.removeEventListener("google-identity-loaded", initOneTap);
      clearTimeout(timeoutId);
    };
  }, [googleClientId, enabled, reload]);
}
