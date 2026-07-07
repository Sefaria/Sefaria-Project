import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import ChooseView from './ChooseView.jsx';
import EmailView from './EmailView.jsx';
import ForgotView from './ForgotView.jsx';
import ForgotSentView from './ForgotSentView.jsx';


function getCsrf(explicit) {
  if (explicit) return explicit;
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

/** Pick the first human-readable error string from the register view's error dict. */
function pickFirstError(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.error === 'string') return data.error;
  for (const k of Object.keys(data)) {
    if (k === '_auth') continue;
    if (typeof data[k] === 'string') return data[k];
  }
  return null;
}

function authError(data, fallback) {
  const metadata = data && data._auth;
  const message = pickFirstError(data) || fallback;
  return {
    message: Sefaria._(message),
    code: metadata && metadata.code,
    providers: metadata && Array.isArray(metadata.providers) ? metadata.providers : [],
  };
}

/** Poll until check() is truthy (or give up after ~8s), then run cb. Used to wait for
 *  the async-loaded Google / Apple SDK scripts before rendering their buttons. */
function whenReady(check, cb) {
  let tries = 80;
  let cancelled = false;
  let timer = null;
  const tick = () => {
    if (cancelled) return;
    if (check()) { cb(); return; }
    if (--tries <= 0) return;
    timer = setTimeout(tick, 100);
  };
  tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

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
  const [captchaError, setCaptchaError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const csrf = getCsrf(csrfToken);
  const captchaToken = useRef('');
  const captchaWidgetId = useRef(null);
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
  const goChoose = () => { setView('choose'); setError(null); setCaptchaError(null); };
  const switchFlow = (f) => (e) => {
    e && e.preventDefault();
    setFlow(f);
    setView('choose');
    setError(null);
    setCaptchaError(null);
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

  const endRegistration = useCallback(() => {
    const analytics = registrationAnalytics.current;
    if (!analytics.started || analytics.ended) return;
    analytics.ended = true;
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
    setError(null);
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

  // ---- reCAPTCHA (register only) -----------------------------------------
  useEffect(() => {
    const active = view === 'email' && flow === 'register' && !!recaptchaSiteKey;
    if (!active) {
      captchaWidgetId.current = null;
      captchaToken.current = '';
      return undefined;
    }
    const renderWidget = () => {
      const slot = document.getElementById('auth-captcha-slot');
      if (!slot || captchaWidgetId.current !== null || !window.grecaptcha.render) return;
      try {
        captchaWidgetId.current = window.grecaptcha.render(slot, {
          sitekey: recaptchaSiteKey,
          callback: (t) => { captchaToken.current = t; },
          'expired-callback': () => { captchaToken.current = ''; },
        });
      } catch (e) { /* not ready / already rendered */ }
    };
    return whenReady(
      () => window.grecaptcha && window.grecaptcha.render,
      () => {
        if (window.grecaptcha.ready) window.grecaptcha.ready(renderWidget);
        else renderWidget();
      },
    );
  }, [view, flow, recaptchaSiteKey]);

  // ---- email submit -------------------------------------------------------
  const submitEmail = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setCaptchaError(null);
    try {
      if (flow === 'register') {
        startRegistration();
        trackRegistration('form_submit');
        // Reuse the existing /register view's JSON ("noredirect") mode — keeps the
        // server-side captcha validation and full onboarding side effects.
        const body = new URLSearchParams();
        body.set('email', fields.email);
        body.set('password1', fields.password);
        body.set('first_name', fields.first);
        body.set('last_name', fields.last);
        body.set('g-recaptcha-response', captchaToken.current || '');
        body.set('next', next || '/');
        body.set('noredirect', '1');
        const res = await fetch('/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrf },
          body: body.toString(),
        });
        const data = await res.json().catch(() => ({}));
        if (data && data.redirect) {
          registrationAnalytics.current.status = 'success';
          trackRegistration('form_submit_result', { status: 'success' });
          endRegistration();
          window.location.href = data.redirect;
          return;
        }
        const message = pickFirstError(data) || 'Something went wrong. Try again.';
        trackRegistration('form_submit_result', {
          status: 'failure',
          error: Object.keys(data || {}).filter((key) => key !== '_auth').map((key) => `${key}: ${data[key]}`).join(' | '),
        });
        const hasCaptchaError = !!(data && data.captcha);
        const nonCaptchaError = Object.keys(data || {}).some((key) => key !== '_auth' && key !== 'captcha');
        setError(nonCaptchaError ? authError(data, message) : null);
        if (hasCaptchaError) setCaptchaError(Sefaria._('Verify that you are not a robot'));
        if (window.grecaptcha && captchaWidgetId.current !== null) {
          try { window.grecaptcha.reset(captchaWidgetId.current); } catch (e2) { /* noop */ }
          captchaToken.current = '';
        }
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
          body: JSON.stringify({ email: fields.email, password: fields.password }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { window.location.href = next || '/'; return; }
        setError(authError(data, 'Email and/or password are incorrect'));
      }
    } catch (err) {
      if (flow === 'register') {
        trackRegistration('form_submit_result', { status: 'failure', error: 'network_error' });
      }
      setError(authError(null, 'Something went wrong. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ email: fields.email }),
      });
      if (res.ok) { setView('forgot-sent'); }
      else {
        const d = await res.json().catch(() => ({}));
        setError(authError(d, 'Something went wrong. Try again.'));
      }
    } catch (e) { setError(authError(null, 'Something went wrong. Try again.')); }
    finally { setSubmitting(false); }
  };

  // ---- shared pieces ------------------------------------------------------
  const showProvider = (provider) => {
    const normalized = provider.toLowerCase();
    const target = normalized === 'google' ? 'google-signin-button' : 'apple-signin-button';
    setView('choose');
    setError(null);
    window.setTimeout(() => {
      const element = document.getElementById(target);
      if (element) {
        element.scrollIntoView({ block: 'center' });
        element.focus();
      }
    }, 0);
  };
  const errorBanner = error ? (
    <div className="sefaria-auth-error" role="alert">
      <img className="sefaria-auth-error-icon" src="/static/icons/info.svg" alt="" aria-hidden="true" />
      <div className="sefaria-auth-error-content">
        <span>{error.message}</span>
      {error.code === 'sso_only_account' && error.providers.map((provider) => (
        <a
          key={provider}
          href={`#${provider.toLowerCase() === 'google' ? 'google-signin-button' : 'apple-signin-button'}`}
          className="sefaria-auth-provider-action"
          onClick={(event) => { event.preventDefault(); showProvider(provider); }}
        >
          {Sefaria._(`Sign in with ${provider.charAt(0).toUpperCase()}${provider.slice(1).toLowerCase()}`)}
        </a>
      ))}
      </div>
    </div>
  ) : null;

  // ---- views --------------------------------------------------------------
  const onEmailClick = () => { setView('email'); setError(null); };
  const onForgotClick = (e) => { e.preventDefault(); setView('forgot'); setError(null); };
  const onForgotBack = () => { setView('email'); setError(null); };
  const onSignIn = () => { setFlow('login'); setView('choose'); };

  let content;
  if (view === 'email') {
    content = (
      <EmailView
        flow={flow} switchFlow={switchFlow} errorBanner={errorBanner}
        fields={fields} submitting={submitting} captchaError={captchaError} setField={setField}
        goChoose={goChoose} submitEmail={submitEmail} startRegistration={startRegistration}
        recaptchaSiteKey={recaptchaSiteKey} onForgotClick={onForgotClick}
      />
    );
  } else if (view === 'forgot') {
    content = (
      <ForgotView
        errorBanner={errorBanner} emailValue={fields.email}
        submitting={submitting} setField={setField} submitForgot={submitForgot} onBack={onForgotBack}
      />
    );
  } else if (view === 'forgot-sent') {
    content = <ForgotSentView onSignIn={onSignIn} />;
  } else {
    content = (
      <ChooseView
        flow={flow} switchFlow={switchFlow} errorBanner={errorBanner}
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
