import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { whenReady, makeUuid, safeNext, authError, ALLAUTH_PROVIDER_TOKEN_URL } from './utils.js';
import { persistPendingAttempt, SIGNUP_METHOD } from './signupAnalytics.js';
import { getCsrfToken } from '../sefaria/csrf';

/**
 * useProviderTriggers — lets a "Continue with Google/Apple" affordance fire from *any* view,
 * not just ChooseView's own buttons. Mounted once by AuthPage (both SDKs rely on state/DOM
 * events that must exist regardless of which card view is currently showing).
 *
 * Apple's SDK can start sign-in from any click handler (`triggerApple()`, no DOM dependency).
 * Google's cannot: its rendered button is served from an accounts.google.com iframe, a
 * cross-origin boundary — a click can only ever be received by that iframe's actual on-screen
 * pixels, never dispatched into it from a distance. So the real Google button is portaled
 * (`createPortal`) directly into whichever "Continue with Google" element is currently
 * registered as the active target (`registerGoogleTarget`, a ref callback), and re-rendered
 * there each time the target changes — this keeps the real, focusable control in the DOM
 * exactly where it's visually placed (tab order matches what's on screen), at the cost of a
 * fresh (invisible — the overlay is opacity ~0) re-init of the Google button on every target
 * change. That's cheap: it only happens on mount into ChooseView and, more rarely, when an
 * sso_only_account error banner registers its own inline target (see ErrorBanner.jsx).
 *
 * A trigger can fail from anywhere too, sometimes asynchronously (Google's popup result arrives
 * via its own callback, Apple's via a DOM event) — `setActiveErrorHandler` lets whichever view
 * is currently mounted register its own local `setError` as where that failure should surface,
 * so it shows in place rather than forcing a navigation to ChooseView.
 */
export function useProviderTriggers({ next, tracking }) {
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [targetEl, setTargetEl] = useState(null);
  const googleBtnRef = useRef(null);
  const activeErrorHandlerRef = useRef(() => {});
  const nextRef = useRef(next);
  nextRef.current = next;
  // tracking is a fresh object every AuthPage render (not memoized) — keep it in a ref,
  // same as nextRef, so it doesn't force the Google/Apple SDK-init effects below to
  // re-run just because e.g. an unrelated form field changed.
  const trackingRef = useRef(tracking);
  trackingRef.current = tracking;

  const setActiveErrorHandler = useCallback((handler) => {
    activeErrorHandlerRef.current = handler || (() => {});
  }, []);

  // Google popup-mode abandonment detection (see onGoogleButtonClicked below). Mutually
  // exclusive with the redirect-mode path — only ever touched when Sefaria.ssoUseRedirect()
  // is false. 'awaiting_close' (clicked) -> 'processing' (Google's own callback fired, our
  // backend fetch is in flight) -> 'done' (that fetch resolved).
  const googlePopupStateRef = useRef('idle');
  const popupFocusHandlerRef = useRef(null);
  const popupFocusTimeoutRef = useRef(null);

  const clearPopupWatch = useCallback(() => {
    if (popupFocusHandlerRef.current) {
      window.removeEventListener('focus', popupFocusHandlerRef.current);
      popupFocusHandlerRef.current = null;
    }
    if (popupFocusTimeoutRef.current) {
      clearTimeout(popupFocusTimeoutRef.current);
      popupFocusTimeoutRef.current = null;
    }
  }, []);

  const registerGoogleTarget = useCallback((el) => {
    setTargetEl(el);
  }, []);

  const { googleClientId } = Sefaria;

  const onGoogleResult = useCallback(async (resp) => {
    // click_listener (onGoogleButtonClicked below) now fires chooseMethod/startProcess
    // synchronously at click time — this callback only fires on a real credential, so it
    // must not call them again (that would end the click-time attempt as
    // "abandoned_for_new_attempt" and open a second one for the same login).
    // Google's own callback just fired, so a real fetch to our backend is now in flight —
    // the popup-abandonment watch below must not treat this as "closed without a credential".
    googlePopupStateRef.current = 'processing';
    setSsoLoading(true);
    try {
      const res = await fetch(ALLAUTH_PROVIDER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          provider: 'google',
          process: 'login',
          token: { client_id: googleClientId, id_token: resp.credential },
        }),
      });
      const data = await res.json().catch(() => ({}));
      googlePopupStateRef.current = 'done';
      if (res.ok) {
        trackingRef.current.endProcess('success', null);
        window.location.href = safeNext(nextRef.current);
      } else {
        setSsoLoading(false);
        trackingRef.current.endProcess('failure', authError(data, 'auth.generic_error').message);
        activeErrorHandlerRef.current(authError(data, 'auth.generic_error'));
      }
    } catch (e) {
      googlePopupStateRef.current = 'done';
      setSsoLoading(false);
      trackingRef.current.endProcess('failure', 'network_error');
      activeErrorHandlerRef.current(authError(null, 'auth.generic_error'));
    }
  }, [googleClientId]);

  // Mirrors triggerApple below: click is now a real, observable signal for Google too (GIS's
  // click_listener, see renderButton config), so method_chosen/process_started fire
  // synchronously here instead of being synthesized in onGoogleResult.
  const onGoogleButtonClicked = useCallback(() => {
    const attemptId = trackingRef.current.chooseMethod(SIGNUP_METHOD.GOOGLE);
    trackingRef.current.startProcess();
    if (Sefaria.ssoUseRedirect()) {
      trackingRef.current.suppressFlowEndRef.current = true;
      persistPendingAttempt({ ...trackingRef.current.getIds(), attemptId, method: SIGNUP_METHOD.GOOGLE });
      return;
    }
    // Popup mode: GIS gives no cancellation callback at all, so watch for focus returning to
    // our window instead — that only happens once the popup is actually gone, whether closed
    // or completed, so a long deliberation with the popup still open never triggers this.
    clearPopupWatch();
    googlePopupStateRef.current = 'awaiting_close';
    const onFocus = () => {
      popupFocusHandlerRef.current = null;
      popupFocusTimeoutRef.current = setTimeout(() => {
        popupFocusTimeoutRef.current = null;
        // Margin for Google's own callback hand-off, NOT for our network round trip:
        // 'processing'/'done' both mean something already came back from Google, and
        // 'processing' must be left to resolve on its own however long our backend takes —
        // no artificial deadline is imposed on a real in-flight request.
        if (googlePopupStateRef.current === 'awaiting_close') {
          trackingRef.current.endProcess('failure', 'popup_closed_by_user');
        }
        // NB: if the user closes the popup AND leaves/closes this tab within this ~1200ms
        // window, nothing fires at all — an accepted, irreducible limit of a client-side-only
        // approach (Google's button flow has no cancellation callback of its own).
      }, 1200);
    };
    popupFocusHandlerRef.current = onFocus;
    window.addEventListener('focus', onFocus, { once: true });
  }, [clearPopupWatch]);

  useEffect(() => {
    setGoogleReady(false);
    googlePopupStateRef.current = 'idle';
    if (!googleClientId || !targetEl) return undefined;
    const useRedirect = Sefaria.ssoUseRedirect();
    const stopWaiting = whenReady(
      () => window.google?.accounts?.id && googleBtnRef.current,
      () => {
        try {
          const config = {
            client_id: googleClientId,
            ux_mode: useRedirect ? 'redirect' : 'popup',
          };
          if (useRedirect) {
            config.login_uri = `${window.location.origin}/api/auth/google/redirect`;
            // login_uri must exactly match a pre-registered URI with no query string, so
            // `next` travels via this cookie instead — read by SefariaAccountAdapter
            // .get_login_redirect_url / .get_signup_redirect_url (sso/adapters.py); keep
            // the cookie name in sync with that file.
            // max-age=300 is just a backstop for an abandoned attempt (closed tab, etc.) —
            // ClearSsoNextCookieMiddleware clears it on a real response.
            // SameSite=None+Secure because GIS's redirect POST back here is cross-site
            // (from accounts.google.com), which SameSite=Lax would block.
            document.cookie = `sefaria_sso_next=${encodeURIComponent(safeNext(nextRef.current))}; path=/; max-age=300; SameSite=None; Secure`;
          } else {
            config.callback = onGoogleResult;
          }
          window.google.accounts.id.initialize(config);
          const el = googleBtnRef.current;
          el.innerHTML = '';
          const width = Math.max(200, Math.min(400, el.offsetWidth || 360));
          window.google.accounts.id.renderButton(el, {
            type: 'standard', theme: 'outline', size: 'large',
            text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', width,
            locale: Sefaria.interfaceLang === 'hebrew' ? 'iw' : 'en',
            click_listener: onGoogleButtonClicked,
          });
          setGoogleReady(true);
        } catch (e) { /* ignore */ }
      },
    );
    return () => {
      stopWaiting();
      clearPopupWatch();
    };
  }, [googleClientId, targetEl, onGoogleResult, onGoogleButtonClicked, clearPopupWatch]);

  const { appleClientId } = Sefaria;
  const ssoRedirectState = useRef(makeUuid()).current;

  const failApple = useCallback(() => {
    activeErrorHandlerRef.current(authError(null, 'auth.generic_error'));
  }, []);

  useEffect(() => {
    setAppleReady(false);
    if (!appleClientId) return undefined;
    // Redirect mode navigates straight to allauth's /accounts/apple/login/ (see
    // triggerApple below) and never touches the Apple JS SDK, so it's ready immediately.
    if (Sefaria.ssoUseRedirect()) {
      setAppleReady(true);
      return undefined;
    }
    const onOk = async (ev) => {
      const a = (ev.detail?.authorization) || {};
      const u = (ev.detail?.user) || {};
      const n = u.name || {};
      setSsoLoading(true);
      try {
        const res = await fetch('/api/auth/apple/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify({
            id_token: a.id_token, first_name: n.firstName || '', last_name: n.lastName || '', email: u.email || '',
          }),
        });
        if (res.ok) {
          trackingRef.current.endProcess('success', null);
          window.location.href = safeNext(nextRef.current);
        } else {
          setSsoLoading(false);
          trackingRef.current.endProcess('failure', 'apple_callback_failed');
          failApple();
        }
      } catch (e) {
        setSsoLoading(false);
        trackingRef.current.endProcess('failure', 'network_error');
        failApple();
      }
    };
    const onFail = (ev) => {
      const err = ev.detail?.error || 'unknown';
      // Fire tracking even when popup_closed_by_user suppresses the on-screen error —
      // the attempt was still abandoned and should still show up in the funnel.
      trackingRef.current.endProcess('failure', err);
      if (err !== 'popup_closed_by_user') failApple();
    };
    document.addEventListener('AppleIDSignInOnSuccess', onOk);
    document.addEventListener('AppleIDSignInOnFailure', onFail);
    const stopWaiting = whenReady(
      () => window.AppleID?.auth,
      () => {
        try {
          window.AppleID.auth.init({
            clientId: appleClientId,
            scope: 'name email',
            redirectURI: `${window.location.origin}/accounts/apple/login/callback/`,
            state: ssoRedirectState,
            usePopup: true,
          });
          setAppleReady(true);
        } catch (e) { /* ignore */ }
      },
    );
    return () => {
      stopWaiting();
      document.removeEventListener('AppleIDSignInOnSuccess', onOk);
      document.removeEventListener('AppleIDSignInOnFailure', onFail);
    };
  }, [appleClientId, ssoRedirectState, failApple]);

  const triggerApple = useCallback(() => {
    if (!appleReady) return;
    // We *do* control this call (unlike Google's iframe-driven button), so method_chosen/
    // process_started can fire synchronously right here for both popup and redirect mode.
    const attemptId = trackingRef.current.chooseMethod(SIGNUP_METHOD.APPLE);
    trackingRef.current.startProcess();
    if (Sefaria.ssoUseRedirect()) {
      trackingRef.current.suppressFlowEndRef.current = true;
      persistPendingAttempt({ ...trackingRef.current.getIds(), attemptId, method: SIGNUP_METHOD.APPLE });
      window.location.href = `/accounts/apple/login/?next=${encodeURIComponent(safeNext(nextRef.current))}`;
      return;
    }
    if (!window.AppleID?.auth) return;
    try {
      const signIn = window.AppleID.auth.signIn();
      if (signIn && typeof signIn.catch === 'function') {
        signIn.catch((err) => {
          trackingRef.current.endProcess('failure', err?.error || 'unknown');
          if (err?.error !== 'popup_closed_by_user') failApple();
        });
      }
    } catch (err) {
      trackingRef.current.endProcess('failure', err?.error || 'unknown');
      failApple();
    }
  }, [appleReady, failApple]);

  const overlayNode = targetEl && createPortal(
    <div className="sefaria-provider-sdk-overlay" style={{ pointerEvents: googleReady ? 'auto' : 'none' }}>
      <div ref={googleBtnRef} />
    </div>,
    targetEl,
  );

  return {
    googleReady, appleReady, ssoLoading, overlayNode, registerGoogleTarget, setActiveErrorHandler, triggerApple,
  };
}
