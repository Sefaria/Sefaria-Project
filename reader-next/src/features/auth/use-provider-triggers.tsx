/**
 * Lets a "Continue with Google/Apple" affordance fire from any auth view (the choose card's buttons, or the error banner's inline
 * links). Mounted once by the auth page. Ported from static/js/auth/useSsoSignIn.jsx (useProviderTriggers), same behaviour:
 *
 * - Apple's SDK can start sign-in from any click (`triggerApple()`).
 * - Google's rendered button is a cross-origin iframe: a click only reaches it on its own pixels. So the real button is portaled
 *   (nearly invisible) into whichever "Continue with Google" element is registered (`registerGoogleTarget`), and re-rendered there
 *   when the target changes. The visible control is ours; the click lands on Google's.
 * - Failures can arrive asynchronously: the mounted view registers where they show (`setActiveErrorHandler`).
 * - Phones (ssoUseRedirect) use full-page redirects: Google posts back to /api/auth/google/redirect with `next` in the
 *   sefaria_sso_next cookie (read by sso/adapters.py); Apple goes to allauth's /accounts/apple/login/?next=. The funnel attempt is
 *   persisted first (resumed on the next load).
 *
 * @feature ACC-012 Sign in with Google and Apple
 * @feature ANL-013 Sign-up funnel analytics
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ProviderSdkOverlay } from "~/ui/ProviderButton/ProviderButton";
import { persistPendingAttempt, SIGNUP_METHOD } from "~/lib/auth/analytics";
import { ensureCsrfToken } from "~/lib/auth/csrf";
import { sameOrigin } from "~/lib/auth/http";
import { ssoUseRedirect } from "~/lib/auth/sdk";
import type { SignUpTracking } from "~/lib/auth/use-sign-up-tracking";
import { ALLAUTH_PROVIDER_TOKEN_URL, authError, makeUuid, safeNext, whenReady, type AuthError } from "~/lib/auth/utils";

export type ErrorHandler = ((e: AuthError | null) => void) | null;

export interface ProviderTriggers {
  googleReady: boolean;
  appleReady: boolean;
  ssoLoading: boolean;
  overlayNode: ReactNode;
  registerGoogleTarget: (el: HTMLElement | null) => void;
  setActiveErrorHandler: (h: ErrorHandler) => void;
  triggerApple: () => void;
}

export interface ProviderTriggerOptions {
  next: string;
  tracking: SignUpTracking;
  googleClientId?: string;
  appleClientId?: string;
  interfaceLang?: "english" | "hebrew";
  /** Where to go after success (tests replace it; the real one is a full page load, as on the old site). */
  navigate?: (href: string) => void;
}

const goTo = (href: string) => {
  window.location.href = href;
};

export function useProviderTriggers({
  next, tracking, googleClientId, appleClientId, interfaceLang = "english", navigate = goTo,
}: ProviderTriggerOptions): ProviderTriggers {
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const activeErrorHandlerRef = useRef<(e: AuthError | null) => void>(() => {});
  const nextRef = useRef(next);
  nextRef.current = next;
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const setActiveErrorHandler = useCallback((handler: ErrorHandler) => {
    activeErrorHandlerRef.current = handler || (() => {});
  }, []);

  // popup-mode abandonment: 'awaiting_close' (clicked) -> 'processing' (Google's callback fired) -> 'done' (our request answered)
  const googlePopupStateRef = useRef<"idle" | "awaiting_close" | "processing" | "done">("idle");
  const popupFocusHandlerRef = useRef<(() => void) | null>(null);
  const popupFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPopupWatch = useCallback(() => {
    if (popupFocusHandlerRef.current) {
      window.removeEventListener("focus", popupFocusHandlerRef.current);
      popupFocusHandlerRef.current = null;
    }
    if (popupFocusTimeoutRef.current) {
      clearTimeout(popupFocusTimeoutRef.current);
      popupFocusTimeoutRef.current = null;
    }
  }, []);

  const registerGoogleTarget = useCallback((el: HTMLElement | null) => setTargetEl(el), []);

  const onGoogleResult = useCallback(
    async (resp: { credential: string }) => {
      // the click listener already fired chooseMethod/startProcess; this only fires on a real credential
      googlePopupStateRef.current = "processing";
      setSsoLoading(true);
      try {
        const res = await fetch(sameOrigin(ALLAUTH_PROVIDER_TOKEN_URL), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRFToken": await ensureCsrfToken() },
          body: JSON.stringify({ provider: "google", process: "login", token: { client_id: googleClientId, id_token: resp.credential } }),
        });
        const data = await res.json().catch(() => ({}));
        googlePopupStateRef.current = "done";
        if (res.ok) {
          trackingRef.current.endProcess("success", null);
          navigateRef.current(safeNext(nextRef.current));
        } else {
          setSsoLoading(false);
          const err = authError(data, "auth.generic_error");
          trackingRef.current.endProcess("failure", err.message ?? null);
          activeErrorHandlerRef.current(err);
        }
      } catch {
        googlePopupStateRef.current = "done";
        setSsoLoading(false);
        trackingRef.current.endProcess("failure", "network_error");
        activeErrorHandlerRef.current(authError(null, "auth.generic_error"));
      }
    },
    [googleClientId],
  );

  const onGoogleButtonClicked = useCallback(() => {
    const attemptId = trackingRef.current.chooseMethod(SIGNUP_METHOD.GOOGLE);
    trackingRef.current.startProcess();
    if (ssoUseRedirect()) {
      trackingRef.current.suppressFlowEndRef.current = true;
      persistPendingAttempt({ ...trackingRef.current.getIds(), attemptId, method: SIGNUP_METHOD.GOOGLE });
      return;
    }
    // GIS gives no cancel callback: focus coming back to this window means the popup is gone (closed or completed)
    clearPopupWatch();
    googlePopupStateRef.current = "awaiting_close";
    const onFocus = () => {
      popupFocusHandlerRef.current = null;
      popupFocusTimeoutRef.current = setTimeout(() => {
        popupFocusTimeoutRef.current = null;
        if (googlePopupStateRef.current === "awaiting_close") trackingRef.current.endProcess("failure", "popup_closed_by_user");
      }, 1200);
    };
    popupFocusHandlerRef.current = onFocus;
    window.addEventListener("focus", onFocus, { once: true });
  }, [clearPopupWatch]);

  useEffect(() => {
    setGoogleReady(false);
    googlePopupStateRef.current = "idle";
    if (!googleClientId || !targetEl) return undefined;
    const useRedirect = ssoUseRedirect();
    const stopWaiting = whenReady(
      () => window.google?.accounts?.id && googleBtnRef.current,
      () => {
        try {
          const id = window.google!.accounts!.id!;
          const config: Record<string, unknown> = {
            client_id: googleClientId,
            ux_mode: useRedirect ? "redirect" : "popup",
            use_fedcm_for_button: true,
          };
          if (useRedirect) {
            config.login_uri = `${window.location.origin}/api/auth/google/redirect`;
            // login_uri must be a registered URI without a query, so `next` travels in this cookie (sso/adapters.py reads it;
            // ClearSsoNextCookieMiddleware clears it). SameSite=None because Google's POST back is cross-site.
            document.cookie = `sefaria_sso_next=${encodeURIComponent(safeNext(nextRef.current))}; path=/; max-age=300; SameSite=None; Secure`;
          } else {
            config.callback = onGoogleResult;
          }
          id.initialize(config);
          const el = googleBtnRef.current!;
          el.innerHTML = "";
          const width = Math.max(200, Math.min(400, el.offsetWidth || 360));
          id.renderButton(el, {
            type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "center", width,
            locale: interfaceLang === "hebrew" ? "iw" : "en",
            click_listener: onGoogleButtonClicked,
          });
          setGoogleReady(true);
        } catch {
          /* ignore */
        }
      },
    );
    return () => {
      stopWaiting();
      clearPopupWatch();
    };
  }, [googleClientId, targetEl, onGoogleResult, onGoogleButtonClicked, clearPopupWatch, interfaceLang]);

  const ssoRedirectState = useRef(makeUuid()).current;
  const failApple = useCallback(() => activeErrorHandlerRef.current(authError(null, "auth.generic_error")), []);

  useEffect(() => {
    setAppleReady(false);
    if (!appleClientId) return undefined;
    // redirect mode goes straight to allauth's /accounts/apple/login/ and never touches the SDK
    if (ssoUseRedirect()) {
      setAppleReady(true);
      return undefined;
    }
    const onOk = async (ev: Event) => {
      const detail = (ev as CustomEvent).detail ?? {};
      const a = detail.authorization || {};
      const u = detail.user || {};
      const n = u.name || {};
      setSsoLoading(true);
      try {
        const res = await fetch(sameOrigin("/api/auth/apple/callback"), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRFToken": await ensureCsrfToken() },
          body: JSON.stringify({ id_token: a.id_token, first_name: n.firstName || "", last_name: n.lastName || "", email: u.email || "" }),
        });
        if (res.ok) {
          trackingRef.current.endProcess("success", null);
          navigateRef.current(safeNext(nextRef.current));
        } else {
          setSsoLoading(false);
          trackingRef.current.endProcess("failure", "apple_callback_failed");
          failApple();
        }
      } catch {
        setSsoLoading(false);
        trackingRef.current.endProcess("failure", "network_error");
        failApple();
      }
    };
    const onFail = (ev: Event) => {
      const err = (ev as CustomEvent).detail?.error || "unknown";
      // tracked even when popup_closed_by_user keeps the error off the screen
      trackingRef.current.endProcess("failure", err);
      if (err !== "popup_closed_by_user") failApple();
    };
    document.addEventListener("AppleIDSignInOnSuccess", onOk);
    document.addEventListener("AppleIDSignInOnFailure", onFail);
    const stopWaiting = whenReady(
      () => window.AppleID?.auth,
      () => {
        try {
          window.AppleID!.auth!.init({
            clientId: appleClientId,
            scope: "name email",
            redirectURI: `${window.location.origin}/accounts/apple/login/callback/`,
            state: ssoRedirectState,
            usePopup: true,
          });
          setAppleReady(true);
        } catch {
          /* ignore */
        }
      },
    );
    return () => {
      stopWaiting();
      document.removeEventListener("AppleIDSignInOnSuccess", onOk);
      document.removeEventListener("AppleIDSignInOnFailure", onFail);
    };
  }, [appleClientId, ssoRedirectState, failApple]);

  const triggerApple = useCallback(() => {
    if (!appleReady) return;
    const attemptId = trackingRef.current.chooseMethod(SIGNUP_METHOD.APPLE);
    trackingRef.current.startProcess();
    if (ssoUseRedirect()) {
      trackingRef.current.suppressFlowEndRef.current = true;
      persistPendingAttempt({ ...trackingRef.current.getIds(), attemptId, method: SIGNUP_METHOD.APPLE });
      navigateRef.current(`/accounts/apple/login/?next=${encodeURIComponent(safeNext(nextRef.current))}`);
      return;
    }
    if (!window.AppleID?.auth) return;
    try {
      const signIn = window.AppleID.auth.signIn() as Promise<unknown> | undefined;
      if (signIn && typeof signIn.catch === "function") {
        signIn.catch((err: { error?: string }) => {
          trackingRef.current.endProcess("failure", err?.error || "unknown");
          if (err?.error !== "popup_closed_by_user") failApple();
        });
      }
    } catch (err) {
      trackingRef.current.endProcess("failure", (err as { error?: string })?.error || "unknown");
      failApple();
    }
  }, [appleReady, failApple]);

  const overlayNode = targetEl
    ? createPortal(
        <ProviderSdkOverlay active={googleReady}>
          <div ref={googleBtnRef} />
        </ProviderSdkOverlay>,
        targetEl,
      )
    : null;

  return { googleReady, appleReady, ssoLoading, overlayNode, registerGoogleTarget, setActiveErrorHandler, triggerApple };
}
