import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import AuthCard from '../common/AuthCard.jsx';
import Divider from '../common/Divider.jsx';
import LegalText from '../common/LegalText.jsx';
import Captcha from '../common/Captcha.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';
import ProviderButton from '../common/ProviderButton.jsx';

/** Translate helper that works in both the app (global Sefaria) and Storybook (stub). */
const _ = (s) => (typeof window !== 'undefined' && window.Sefaria && window.Sefaria._ ? window.Sefaria._(s) : s);


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
    message: _(message),
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
  dir = 'ltr',
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
    const useRedirect = !!(window.SefariaAuth && window.SefariaAuth.useRedirect());
    if (useRedirect && window.SefariaAuth) {
      window.SefariaAuth.setRedirectState(ssoRedirectState);
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
            locale: dir === 'rtl' ? 'iw' : 'en',
          });
          setGoogleReady(true);
        } catch (e) { /* ignore */ }
      },
    );
    return stopWaiting;
  }, [googleClientId, view, onSSOResult, ssoRedirectState, dir]);

  // Initialize Apple JS after its async script loads. The custom button starts sign-in
  // through AppleID.auth.signIn(); the SDK dispatches the success/failure events below.
  useEffect(() => {
    setAppleReady(false);
    if (!appleClientId || view !== 'choose') return undefined;
    const useRedirect = !!(window.SefariaAuth && window.SefariaAuth.useRedirect());
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
        setError(authError(data, message));
        if (data && data.captcha) setCaptchaError(_('Verify that you are not a robot'));
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
  // Render the full localized compliance sentence, substituting the (localized) link
  // labels with anchors — keeps correct word order in both English and Hebrew.
  const legal = (() => {
    if (dir === 'rtl') {
      return (
        <LegalText>
          {_('Auth legal prefix')}
          <a href="/terms">{_('Auth Terms of Use')}</a>
          {_('Auth legal conjunction')}
          <a href="/privacy-policy">{_('Auth Privacy Policy')}</a>
          {_('Auth legal suffix')}
        </LegalText>
      );
    }
    const sentence = _("By continuing, you are agreeing to Sefaria's Terms of Use and Privacy Policy.");
    const links = [[_('Terms of Use'), '/terms'], [_('Privacy Policy'), '/privacy-policy']];
    const parts = [];
    let rest = sentence;
    links.forEach(([label, href], i) => {
      const idx = rest.indexOf(label);
      if (idx >= 0) {
        parts.push(rest.slice(0, idx));
        parts.push(<a key={i} href={href}>{label}</a>);
        rest = rest.slice(idx + label.length);
      }
    });
    parts.push(rest);
    return <LegalText>{parts}</LegalText>;
  })();
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
      <div>{error.message}</div>
      {error.code === 'sso_only_account' && error.providers.map((provider) => (
        <a
          key={provider}
          href={`#${provider.toLowerCase() === 'google' ? 'google-signin-button' : 'apple-signin-button'}`}
          className="sefaria-auth-provider-action"
          onClick={(event) => { event.preventDefault(); showProvider(provider); }}
        >
          {_(`Sign in with ${provider.charAt(0).toUpperCase()}${provider.slice(1).toLowerCase()}`)}
        </a>
      ))}
    </div>
  ) : null;

  // ---- views --------------------------------------------------------------
  const renderChoose = () => (
    <AuthCard
      className="sefaria-auth-card--choose"
      dir={dir}
      heading={flow === 'login' ? _('Sign In') : _('Create an Account')}
      sub={flow === 'login'
        ? <>{_("Don't have an account?")} <a href="/register" onClick={switchFlow('register')}>{_('Sign Up')}</a></>
        : <>{_('Already have an account?')} <a href="/login" onClick={switchFlow('login')}>{_('Sign In')}</a></>}
    >
      {errorBanner}
      <div className="sefaria-auth-choose">
        <div className="sefaria-auth-sso-group">
          <div className="sefaria-auth-provider-options">
            {googleClientId && (
              <ProviderButton
                id="google-signin-button"
                provider="google"
                label={_('Continue with Google')}
                disabled={!googleReady}
                sdkOverlayRef={googleBtnRef}
              />
            )}
            {appleClientId && (
              <ProviderButton
                id="apple-signin-button"
                provider="apple"
                label={_('Continue with Apple')}
                disabled={!appleReady}
                onClick={startAppleSignIn}
              />
            )}
          </div>
          <Divider>{_('or')}</Divider>
        </div>
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={() => { setView('email'); setError(null); }}>
          <span>{_('Continue with Email')}</span>
        </Button>
        {legal}
      </div>
    </AuthCard>
  );

  const renderEmail = () => {
    const isRegister = flow === 'register';
    return (
      <AuthCard
        className={isRegister ? 'sefaria-auth-card--register-email' : 'sefaria-auth-card--login-email'}
        dir={dir}
        onBack={goChoose}
        backLabel={_('Back')}
        heading={isRegister ? _('Create an Account') : _('Sign In')}
        sub={isRegister
          ? <>{_('Already have an account?')} <a href="/login" onClick={switchFlow('login')}>{_('Sign In')}</a></>
          : <>{_("Don't have an account?")} <a href="/register" onClick={switchFlow('register')}>{_('Sign Up')}</a></>}
      >
        {errorBanner}
        <form id={isRegister ? 'register-form' : 'login-form'} className="sefaria-auth-email-form" onSubmit={submitEmail}>
          <div className="sefaria-auth-fields">
            <Input label={dir === 'rtl' ? _('Auth Email') : _('Email Address')} type="email" name="email"
                   dir={dir} inputDir="ltr" autoComplete="email"
                   placeholder="you@example.com" value={fields.email} onChange={setField('email')}
                   onFocus={isRegister ? startRegistration : undefined} />
            <Input label={dir === 'rtl' ? _('Auth Password') : _('Password')} type="password" name="password"
                   dir={dir} inputDir="ltr"
                   autoComplete={isRegister ? 'new-password' : 'current-password'}
                   value={fields.password} onChange={setField('password')}
                   onFocus={isRegister ? startRegistration : undefined}
                   trailingLink={isRegister ? null : { text: dir === 'rtl' ? _('Auth Forgot password?') : _('Forgot password?'), onClick: (e) => { e.preventDefault(); setView('forgot'); setError(null); } }}
                   revealLabel={_('Show password')} hideLabel={_('Hide password')} />
            {isRegister && <Input dir={dir} label={_('First Name')} name="first_name" placeholder={_('First Name')} value={fields.first} onChange={setField('first')} onFocus={startRegistration} />}
            {isRegister && <Input dir={dir} label={_('Last Name')} name="last_name" placeholder={_('Last Name')} value={fields.last} onChange={setField('last')} onFocus={startRegistration} />}
          </div>
          {isRegister && (
            <Captcha error={captchaError}>
              <div id="auth-captcha-slot" />
            </Captcha>
          )}
          <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
            <span>{isRegister ? _('Create Account') : _('Sign In')}</span>
          </Button>
          {legal}
        </form>
      </AuthCard>
    );
  };

  const renderForgot = () => (
    <AuthCard dir={dir} onBack={() => { setView('email'); setError(null); }} backLabel={_('Back')}
      heading={_('Forgot Password?')}>
      {errorBanner}
      <form className="sefaria-auth-email-form" onSubmit={submitForgot}>
        <Input label={dir === 'rtl' ? _('Auth Email') : _('Email Address')} type="email" name="email"
               dir={dir} inputDir="ltr"
               value={fields.email} onChange={setField('email')} />
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
          <span>{_('Send Reset Link')}</span>
        </Button>
      </form>
    </AuthCard>
  );

  const renderForgotSent = () => (
    <AuthCard dir={dir} heading={_('Reset Link Sent')}
      sub={_('Check your email and follow the instructions to reset your password.')}>
      <div className="sefaria-auth-stack">
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={() => { setFlow('login'); setView('choose'); }}>
          <span>{_('Sign In')}</span>
        </Button>
      </div>
    </AuthCard>
  );

  let content;
  if (view === 'email') content = renderEmail();
  else if (view === 'forgot') content = renderForgot();
  else if (view === 'forgot-sent') content = renderForgotSent();
  else content = renderChoose();

  return <div className="sefaria-auth-page" dir={dir}>{content}</div>;
};

AuthPage.propTypes = {
  initialFlow: PropTypes.oneOf(['login', 'register']),
  googleClientId: PropTypes.string,
  appleClientId: PropTypes.string,
  recaptchaSiteKey: PropTypes.string,
  ssoRedirectState: PropTypes.string,
  next: PropTypes.string,
  csrfToken: PropTypes.string,
  dir: PropTypes.oneOf(['ltr', 'rtl']),
};

export default AuthPage;
