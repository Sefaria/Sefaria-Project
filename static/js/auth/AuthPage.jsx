import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import ChooseView from './ChooseView.jsx';
import EmailView from './EmailView.jsx';
import ForgotView from './ForgotView.jsx';
import ForgotSentView from './ForgotSentView.jsx';
import { getCsrf, authError, whenReady } from './utils.js';

function makeFlowId() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * AuthPage — the React login / register / reset experience (spec 1602).
 *
 * A single state machine that swaps the card content in place (no page navigation):
 *   view ∈ { choose, email, forgot } and flow ∈ { login, register }.
 * The card's own back button returns to `choose`; the browser URL stays /login or /register.
 *
 * SSO uses the existing backend callbacks (/api/auth/{google,apple}/callback). Email
 * login/register use JSON+session endpoints (/api/auth/login, /api/auth/register).
 */
const AuthPage = ({
  initialFlow = 'login',
  googleClientId = '',
  appleClientId = '',
  recaptchaSiteKey = '',
  ssoRedirectState = '',
  next = '/',
  csrfToken = '',
}) => {
  const [flow, setFlow] = useState(initialFlow === 'register' ? 'register' : 'login');
  const [view, setView] = useState('choose'); // choose | email | forgot
  const [fields, setFields] = useState({ email: '', password: '', first: '', last: '' });
  const [error, setError] = useState(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const csrf = getCsrf(csrfToken);
  const googleBtnRef = useRef(null);
  const fieldsRef = useRef(fields);
  const registrationAnalytics = useRef({
    flowId: makeFlowId(),
    started: false,
    ended: false,
    status: 'failure',
  });
  fieldsRef.current = fields;

  const setField = (k) => (e) => {
    const value = e.target.value; // capture before the async setState updater (React event pooling)
    setFields((f) => ({ ...f, [k]: value }));
  };
  const clearError = () => setError(null);
  const switchFlow = (f) => (e) => {
    e && e.preventDefault();
    setFlow(f);
    setView('choose');
    clearError();
  };

  const trackRegistration = useCallback((name, extra = {}) => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    const filledFields = [
      ['email', fieldsRef.current.email],
      ['first_name', fieldsRef.current.first],
      ['last_name', fieldsRef.current.last],
      ['password1', fieldsRef.current.password],
    ].filter(([, value]) => value).map(([field]) => field);
    const from = new URLSearchParams(window.location.search).get('from') || undefined;
    window.gtag('event', name, {
      project: 'site_registration',
      feature_name: 'site_registration_form',
      flow_id: registrationAnalytics.current.flowId,
      from,
      text: filledFields.length ? filledFields.join('|') : null,
      transport_type: 'beacon',
      ...extra,
    });
  }, []);

  const startRegistration = useCallback(() => {
    if (registrationAnalytics.current.started) return;
    registrationAnalytics.current.started = true;
    trackRegistration('form_start');
  }, [trackRegistration]);

  const endRegistration = useCallback((status) => {
    const analytics = registrationAnalytics.current;
    if (!analytics.started || analytics.ended) return;
    analytics.ended = true;
    if (status) analytics.status = status;
    trackRegistration('form_end', { status: analytics.status });
  }, [trackRegistration]);

  useEffect(() => {
    const onPageLeave = () => endRegistration();
    window.addEventListener('beforeunload', onPageLeave);
    window.addEventListener('popstate', onPageLeave);
    return () => {
      window.removeEventListener('beforeunload', onPageLeave);
      window.removeEventListener('popstate', onPageLeave);
    };
  }, [endRegistration]);

  useEffect(() => {
    const active = flow === 'register' && view === 'email';
    if (active) {
      registrationAnalytics.current = {
        flowId: makeFlowId(),
        started: false,
        ended: false,
        status: 'failure',
      };
      return undefined;
    }
    endRegistration();
    return undefined;
  }, [flow, view, endRegistration]);

  // ---- SSO ----------------------------------------------------------------
  const onSSOResult = useCallback(async (url, body) => {
    clearError();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { window.location.href = next || '/'; }
      else { setError(authError(data, 'Something went wrong. Try again.')); }
    } catch (e) {
      setError(authError(null, 'Something went wrong. Try again.'));
    }
  }, [next]);

  // Google Identity Services does not expose a programmatic sign-in trigger. Render its
  // click target over the custom Figma button after the async SDK script is ready.
  useEffect(() => {
    setGoogleReady(false);
    if (!googleClientId || view !== 'choose') return undefined;
    const useRedirect = Sefaria.ssoUseRedirect();
    if (useRedirect) {
      Sefaria.ssoSetRedirectState(ssoRedirectState);
    }
    const stopWaiting = whenReady(
      () => window.google && window.google.accounts && window.google.accounts.id && googleBtnRef.current,
      () => {
        try {
          const config = {
            client_id: googleClientId,
            ux_mode: useRedirect ? 'redirect' : 'popup',
          };
          if (useRedirect) {
            config.login_uri = `${window.location.origin}/auth/google/redirect`;
          } else {
            config.callback = (resp) => onSSOResult('/api/auth/google/callback', { credential: resp.credential });
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
  }, [googleClientId, view, onSSOResult, ssoRedirectState]);

  // Initialize Apple JS after its async script loads. The custom button starts sign-in
  // through AppleID.auth.signIn(); the SDK dispatches the success/failure events below.
  useEffect(() => {
    setAppleReady(false);
    if (!appleClientId || view !== 'choose') return undefined;
    const useRedirect = Sefaria.ssoUseRedirect();
    const onOk = (ev) => {
      if (useRedirect) return;
      const a = (ev.detail && ev.detail.authorization) || {};
      const u = (ev.detail && ev.detail.user) || {};
      const n = u.name || {};
      onSSOResult('/api/auth/apple/callback', {
        id_token: a.id_token, first_name: n.firstName || '', last_name: n.lastName || '', email: u.email || '',
      });
    };
    const onFail = (ev) => {
      if (!ev.detail || ev.detail.error !== 'popup_closed_by_user') {
        setError(authError(null, 'Something went wrong. Try again.'));
      }
    };
    document.addEventListener('AppleIDSignInOnSuccess', onOk);
    document.addEventListener('AppleIDSignInOnFailure', onFail);
    const stopWaiting = whenReady(
      () => window.AppleID && window.AppleID.auth,
      () => {
        try {
          window.AppleID.auth.init({
            clientId: appleClientId,
            scope: 'name email',
            redirectURI: `${window.location.origin}/auth/apple/redirect`,
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
  }, [appleClientId, view, onSSOResult, ssoRedirectState]);

  const startAppleSignIn = () => {
    if (!appleReady || !window.AppleID || !window.AppleID.auth) return;
    try {
      const signIn = window.AppleID.auth.signIn();
      if (signIn && typeof signIn.catch === 'function') {
        signIn.catch((err) => {
          if (!err || err.error !== 'popup_closed_by_user') {
            setError(authError(null, 'Something went wrong. Try again.'));
          }
        });
      }
    } catch (err) {
      setError(authError(null, 'Something went wrong. Try again.'));
    }
  };

  // ---- shared pieces ------------------------------------------------------
  const showProvider = (provider) => {
    const normalized = provider.toLowerCase();
    const target = normalized === 'google' ? 'google-signin-button' : 'apple-signin-button';
    setView('choose');
    clearError();
    window.setTimeout(() => {
      const element = document.getElementById(target);
      if (element) {
        element.scrollIntoView({ block: 'center' });
        element.focus();
      }
    }, 0);
  };

  // ---- views --------------------------------------------------------------
  const onEmailClick = () => { setView('email'); clearError(); };
  const onForgotClick = (e) => { e.preventDefault(); setView('forgot'); clearError(); };

  let content;
  if (view === 'email') {
    content = (
      <EmailView
        flow={flow} switchFlow={switchFlow} fields={fields} setField={setField}
        onBack={() => setView('choose')} startRegistration={startRegistration}
        trackRegistration={trackRegistration} endRegistration={endRegistration}
        recaptchaSiteKey={recaptchaSiteKey} onForgotClick={onForgotClick}
        next={next} csrf={csrf}
      />
    );
  } else if (view === 'forgot') {
    content = (
      <ForgotView
        emailValue={fields.email} setField={setField} csrf={csrf}
        onSuccess={() => setView('forgot-sent')} onBack={() => setView('email')}
      />
    );
  } else if (view === 'forgot-sent') {
    content = <ForgotSentView onSignIn={switchFlow('login')} />;
  } else {
    content = (
      <ChooseView
        flow={flow} switchFlow={switchFlow} error={error} onProviderClick={showProvider}
        googleClientId={googleClientId} appleClientId={appleClientId}
        googleReady={googleReady} appleReady={appleReady}
        googleBtnRef={googleBtnRef} startAppleSignIn={startAppleSignIn}
        onEmailClick={onEmailClick}
      />
    );
  }

  return <div className="sefaria-auth-page">{content}</div>;
};

AuthPage.propTypes = {
  initialFlow: PropTypes.oneOf(['login', 'register']),
  googleClientId: PropTypes.string,
  appleClientId: PropTypes.string,
  recaptchaSiteKey: PropTypes.string,
  ssoRedirectState: PropTypes.string,
  next: PropTypes.string,
  csrfToken: PropTypes.string,
};

export default AuthPage;
