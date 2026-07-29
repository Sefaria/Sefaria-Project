import React, { useCallback, useEffect, useRef, useState } from 'react';
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
 * pixels, never dispatched into it from a distance. So there is exactly one real Google button
 * (`overlayNode`, rendered once here), invisibly repositioned via `getBoundingClientRect()` to
 * sit on top of whichever "Continue with Google" element is currently registered as the active
 * target (`registerGoogleTarget`, a ref callback — attach it to that element and React's mount/
 * unmount ref calls double as start/stop tracking signals).
 *
 * A trigger can fail from anywhere too, sometimes asynchronously (Google's popup result arrives
 * via its own callback, Apple's via a DOM event) — `setActiveErrorHandler` lets whichever view
 * is currently mounted register its own local `setError` as where that failure should surface,
 * so it shows in place rather than forcing a navigation to ChooseView.
 */
export function useProviderTriggers({ next, tracking }) {
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [rect, setRect] = useState(null);
  const googleBtnRef = useRef(null);
  const targetElRef = useRef(null);
  const resizeObserverRef = useRef(null);
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

  const measure = useCallback(() => {
    const el = targetElRef.current;
    setRect(el ? el.getBoundingClientRect() : null);
  }, []);

  const registerGoogleTarget = useCallback((el) => {
    const observer = resizeObserverRef.current;
    if (targetElRef.current && observer) observer.unobserve(targetElRef.current);
    targetElRef.current = el;
    if (el && observer) observer.observe(el);
    measure();
  }, [measure]);

  // Global listeners for whatever's currently registered — set up once, `measure()` itself
  // no-ops (clears the rect) when nothing is registered.
  useEffect(() => {
    resizeObserverRef.current = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (resizeObserverRef.current && targetElRef.current) resizeObserverRef.current.observe(targetElRef.current);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      resizeObserverRef.current?.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const { googleClientId } = Sefaria;

  const onGoogleResult = useCallback(async (resp) => {
    // Earliest available signal for Google popup mode — the cross-origin iframe gives
    // no earlier "clicked"/"shown" notification, so method_chosen/process_started are
    // synthesized here, right as Google hands back a credential.
    trackingRef.current.chooseMethod(SIGNUP_METHOD.GOOGLE);
    trackingRef.current.startProcess();
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
      if (res.ok) {
        trackingRef.current.endProcess('success', null);
        window.location.href = safeNext(nextRef.current);
      } else {
        trackingRef.current.endProcess('failure', authError(data, 'auth.generic_error').message);
        activeErrorHandlerRef.current(authError(data, 'auth.generic_error'));
      }
    } catch (e) {
      trackingRef.current.endProcess('failure', 'network_error');
      activeErrorHandlerRef.current(authError(null, 'auth.generic_error'));
    }
  }, [googleClientId]);

  useEffect(() => {
    setGoogleReady(false);
    if (!googleClientId) return undefined;
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
          });
          setGoogleReady(true);
        } catch (e) { /* ignore */ }
      },
    );
    return stopWaiting;
  }, [googleClientId, onGoogleResult]);

  // Google gives no click signal, so we can't tell which beforeunload is "the" attempt —
  // suppress flow_ended for any departure while Google is ready; resolved later on return
  // (resumePendingSignUpAttempt). Apple's click is observable, so it gets its own precise
  // suppress in triggerApple instead of this coarse one.
  // OR'd with its current value so a re-render here can't clobber the one-shot
  // true that triggerApple sets right before its own redirect.
  if (tracking) {
    tracking.suppressFlowEndRef.current = tracking.suppressFlowEndRef.current || (Sefaria.ssoUseRedirect() && googleReady);
  }

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
          trackingRef.current.endProcess('failure', 'apple_callback_failed');
          failApple();
        }
      } catch (e) {
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

  const { top = 0, left = 0, width = 0, height = 0 } = rect || {};
  const overlayStyle = {
    position: 'fixed',
    top, left, width, height,
    opacity: 0.0001,
    overflow: 'hidden',
    pointerEvents: rect && googleReady ? 'auto' : 'none',
  };
  const overlayNode = (
    <div className="sefaria-provider-sdk-overlay" style={overlayStyle}>
      <div ref={googleBtnRef} />
    </div>
  );

  return {
    googleReady, appleReady, overlayNode, registerGoogleTarget, setActiveErrorHandler, triggerApple,
  };
}
