import React, { useState, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Divider from './Divider.jsx';
import Button from '../common/Button.jsx';
import ProviderButton from './ProviderButton.jsx';
import LegalText from './LegalText.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { whenReady, authError, getCsrf, makeFlowId, safeNext, focusProvider, ALLAUTH_PROVIDER_TOKEN_URL } from './utils.js';

const ChooseView = ({
  flow, switchFlow, next, onEmailClick,
}) => {
  const [error, setError] = useState(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const googleBtnRef = useRef(null);

  // Memoized so error-state re-renders don't invalidate the SDK useEffect deps.
  const onSSOResult = useCallback(async (url, body) => {
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { window.location.href = safeNext(next); }
      else { setError(authError(data, 'Something went wrong. Try again.')); }
    } catch (e) {
      setError(authError(null, 'Something went wrong. Try again.'));
    }
  }, [next]);

  const googleClientId = Sefaria.googleClientId;
  const appleClientId = Sefaria.appleClientId;
  const ssoRedirectState = useRef(makeFlowId()).current;

  // Google Identity Services does not expose a programmatic sign-in trigger. Render its
  // click target over the custom Figma button after the async SDK script is ready.
  useEffect(() => {
    setGoogleReady(false);
    if (!googleClientId) return;
    const useRedirect = Sefaria.ssoUseRedirect();
    if (useRedirect) {
      Sefaria.ssoSetRedirectState(ssoRedirectState);
    }
    const stopWaiting = whenReady(
      () => window.google?.accounts?.id && googleBtnRef.current,
      () => {
        try {
          const config = {
            client_id: googleClientId,
            ux_mode: useRedirect ? 'redirect' : 'popup',
          };
          if (useRedirect) {
            config.login_uri = `${window.location.origin}/auth/google/redirect`;
          } else {
            config.callback = (resp) => onSSOResult(ALLAUTH_PROVIDER_TOKEN_URL, {
              provider: 'google',
              process: 'login',
              token: { client_id: googleClientId, id_token: resp.credential },
            });
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
  }, [onSSOResult, ssoRedirectState]);

  // Initialize Apple JS after its async script loads. The custom button starts sign-in
  // through AppleID.auth.signIn(); the SDK dispatches the success/failure events below.
  useEffect(() => {
    setAppleReady(false);
    if (!appleClientId) return;
    const useRedirect = Sefaria.ssoUseRedirect();
    const onOk = (ev) => {
      if (useRedirect) return;
      const a = (ev.detail?.authorization) || {};
      const u = (ev.detail?.user) || {};
      const n = u.name || {};
      onSSOResult('/api/auth/apple/callback', {
        id_token: a.id_token, first_name: n.firstName || '', last_name: n.lastName || '', email: u.email || '',
      });
    };
    const onFail = (ev) => {
      if (ev.detail?.error !== 'popup_closed_by_user') {
        setError(authError(null, 'Something went wrong. Try again.'));
      }
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
            usePopup: !useRedirect,
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
  }, [onSSOResult, ssoRedirectState]);

  const startAppleSignIn = () => {
    if (!appleReady || !window.AppleID?.auth) return;
    try {
      const signIn = window.AppleID.auth.signIn();
      if (signIn && typeof signIn.catch === 'function') {
        signIn.catch((err) => {
          if (err?.error !== 'popup_closed_by_user') {
            setError(authError(null, 'Something went wrong. Try again.'));
          }
        });
      }
    } catch (err) {
      setError(authError(null, 'Something went wrong. Try again.'));
    }
  };


  const isLogin = flow === 'login';
  const heading = isLogin
    ? <InterfaceText>Log In</InterfaceText>
    : <InterfaceText context="Auth">Sign Up</InterfaceText>;
  const sub = isLogin
    ? (
      <>
        <InterfaceText>{"Don't have an account?"}</InterfaceText>
        {' '}
        <a href="/register" onClick={switchFlow('register')}>
          <InterfaceText>Sign Up</InterfaceText>
        </a>
      </>
    ) : (
      <>
        <InterfaceText>Already have an account?</InterfaceText>
        {' '}
        <a href="/login" onClick={switchFlow('login')}>
          <InterfaceText context="Auth">Log In</InterfaceText>
        </a>
      </>
    );

  return (
    <AuthCard
      className="sefaria-auth-card--choose"
      heading={heading}
      sub={sub}
    >
      <ErrorBanner error={error} onProviderClick={focusProvider} />
      <div className="sefaria-auth-choose">
        <div className="sefaria-auth-sso-group">
          <div className="sefaria-auth-provider-options">
            {googleClientId && (
              <ProviderButton
                id="google-signin-button"
                provider="google"
                label={Sefaria._('Continue with Google')}
                disabled={!googleReady}
                sdkOverlayRef={googleBtnRef}
              />
            )}
            {appleClientId && (
              <ProviderButton
                id="apple-signin-button"
                provider="apple"
                label={Sefaria._('Continue with Apple')}
                disabled={!appleReady}
                onClick={startAppleSignIn}
              />
            )}
          </div>
        </div>
        <Divider/>
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={onEmailClick}>
          <InterfaceText>Continue with Email</InterfaceText>
        </Button>
        <LegalText />
      </div>
    </AuthCard>
  );
};

ChooseView.propTypes = {
  flow: PropTypes.oneOf(['login', 'register']).isRequired,
  switchFlow: PropTypes.func.isRequired,
  next: PropTypes.string,
  onEmailClick: PropTypes.func.isRequired,
};

export default ChooseView;
