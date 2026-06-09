import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import AuthCard from '../common/AuthCard.jsx';
import Divider from '../common/Divider.jsx';
import LegalText from '../common/LegalText.jsx';
import Captcha from '../common/Captcha.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';

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

/** Poll until check() is truthy (or give up after ~8s), then run cb. Used to wait for
 *  the async-loaded Google / Apple SDK scripts before rendering their buttons. */
function whenReady(check, cb) {
  let tries = 80;
  const tick = () => {
    if (check()) { cb(); return; }
    if (--tries <= 0) return;
    setTimeout(tick, 100);
  };
  tick();
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
  next = '/',
  csrfToken = '',
  dir = 'ltr',
}) => {
  const [flow, setFlow] = useState(initialFlow === 'register' ? 'register' : 'login');
  const [view, setView] = useState('choose'); // choose | email | forgot
  const [fields, setFields] = useState({ email: '', password: '', first: '', last: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const csrf = getCsrf(csrfToken);
  const captchaToken = useRef('');
  const captchaWidgetId = useRef(null);
  const googleBtnRef = useRef(null);
  const appleBtnRef = useRef(null);

  const setField = (k) => (e) => {
    const value = e.target.value; // capture before the async setState updater (React event pooling)
    setFields((f) => ({ ...f, [k]: value }));
  };
  const goChoose = () => { setView('choose'); setError(null); };
  const switchFlow = (f) => (e) => { e && e.preventDefault(); setFlow(f); setView('choose'); setError(null); };

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
      else { setError(_(data.error) || _('Something went wrong. Try again.')); }
    } catch (e) {
      setError(_('Something went wrong. Try again.'));
    }
  }, [next]);

  // Google Identity Services: render the official "Continue with Google" button once the
  // GSI script has loaded (it's async, so we poll rather than checking only at mount).
  useEffect(() => {
    if (!googleClientId || view !== 'choose') return undefined;
    let cancelled = false;
    whenReady(
      () => window.google && window.google.accounts && window.google.accounts.id && googleBtnRef.current,
      () => {
        if (cancelled) return;
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: (resp) => onSSOResult('/api/auth/google/callback', { credential: resp.credential }),
          });
          const el = googleBtnRef.current;
          el.innerHTML = '';
          const width = Math.max(200, Math.min(400, el.offsetWidth || 360));
          window.google.accounts.id.renderButton(el, {
            type: 'standard', theme: 'outline', size: 'large',
            text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', width,
            locale: dir === 'rtl' ? 'iw' : 'en',
          });
        } catch (e) { /* ignore */ }
      },
    );
    return () => { cancelled = true; };
  }, [googleClientId, view, onSSOResult]);

  // Sign in with Apple: init the SDK (which renders the #appleid-signin button) once the
  // Apple JS script has loaded, and handle the success/failure events it dispatches.
  useEffect(() => {
    if (!appleClientId || view !== 'choose') return undefined;
    let cancelled = false;
    const onOk = (ev) => {
      const a = (ev.detail && ev.detail.authorization) || {};
      const u = (ev.detail && ev.detail.user) || {};
      const n = u.name || {};
      onSSOResult('/api/auth/apple/callback', {
        id_token: a.id_token, first_name: n.firstName || '', last_name: n.lastName || '', email: u.email || '',
      });
    };
    const onFail = (ev) => {
      if (!ev.detail || ev.detail.error !== 'popup_closed_by_user') {
        setError(_('Something went wrong. Try again.'));
      }
    };
    document.addEventListener('AppleIDSignInOnSuccess', onOk);
    document.addEventListener('AppleIDSignInOnFailure', onFail);
    whenReady(
      () => window.AppleID && window.AppleID.auth,
      () => {
        if (cancelled) return;
        try {
          window.AppleID.auth.init({
            clientId: appleClientId,
            scope: 'name email',
            redirectURI: window.location.origin + window.location.pathname,
            usePopup: true,
          });
        } catch (e) { /* ignore */ }
      },
    );
    return () => {
      cancelled = true;
      document.removeEventListener('AppleIDSignInOnSuccess', onOk);
      document.removeEventListener('AppleIDSignInOnFailure', onFail);
    };
  }, [appleClientId, view, onSSOResult]);

  // ---- reCAPTCHA (register only) -----------------------------------------
  useEffect(() => {
    const active = view === 'email' && flow === 'register' && !!recaptchaSiteKey;
    if (!active) { captchaWidgetId.current = null; return; }
    if (typeof window === 'undefined' || !window.grecaptcha) return;
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
    if (window.grecaptcha.ready) window.grecaptcha.ready(renderWidget); else renderWidget();
  }, [view, flow, recaptchaSiteKey]);

  // ---- email submit -------------------------------------------------------
  const submitEmail = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (flow === 'register') {
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
        if (data && data.redirect) { window.location.href = data.redirect; return; }
        setError((data && data.captcha)
          ? _('Verify that you are not a robot')
          : (_(pickFirstError(data)) || _('Something went wrong. Try again.')));
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
        setError(_(data.error) || _('Email and/or password are incorrect'));
      }
    } catch (err) {
      setError(_('Something went wrong. Try again.'));
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
      else { const d = await res.json().catch(() => ({})); setError(_(d.error) || _('Something went wrong. Try again.')); }
    } catch (e) { setError(_('Something went wrong. Try again.')); }
    finally { setSubmitting(false); }
  };

  // ---- shared pieces ------------------------------------------------------
  // Render the full localized compliance sentence, substituting the (localized) link
  // labels with anchors — keeps correct word order in both English and Hebrew.
  const legal = (() => {
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
  const errorBanner = error ? <div className="sefaria-auth-error" role="alert">{error}</div> : null;

  // ---- views --------------------------------------------------------------
  const renderChoose = () => (
    <AuthCard
      dir={dir}
      heading={flow === 'login' ? _('Sign In') : _('Create an Account')}
      sub={flow === 'login'
        ? <>{_("Don't have an account?")} <a href="/register" onClick={switchFlow('register')}>{_('Sign Up')}</a></>
        : <>{_('Already have an account?')} <a href="/login" onClick={switchFlow('login')}>{_('Sign In')}</a></>}
    >
      {errorBanner}
      <div className="sefaria-auth-stack">
        {googleClientId && <div ref={googleBtnRef} className="sefaria-sso-btn" />}
        {appleClientId && (
          <div
            ref={appleBtnRef}
            id="appleid-signin"
            className="sefaria-sso-btn"
            data-color="white"
            data-border="true"
            data-type="continue"
            data-mode="center-align"
            data-height="40"
          />
        )}
        <Divider>{_('or')}</Divider>
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={() => { setView('email'); setError(null); }}>
          <span>{_('Continue with Email')}</span>
        </Button>
      </div>
      {legal}
    </AuthCard>
  );

  const renderEmail = () => {
    const isRegister = flow === 'register';
    return (
      <AuthCard
        dir={dir}
        onBack={goChoose}
        backLabel={_('Back')}
        heading={isRegister ? _('Create an Account') : _('Sign In')}
        sub={isRegister
          ? <>{_('Already have an account?')} <a href="/login" onClick={switchFlow('login')}>{_('Sign In')}</a></>
          : <>{_("Don't have an account?")} <a href="/register" onClick={switchFlow('register')}>{_('Sign Up')}</a></>}
      >
        {errorBanner}
        <form className="sefaria-auth-stack" onSubmit={submitEmail}>
          <Input label={_('Email Address')} type="email" name="email" dir="ltr" autoComplete="email"
                 placeholder="you@example.com" value={fields.email} onChange={setField('email')} />
          <Input label={_('Password')} type="password" name="password" dir="ltr"
                 autoComplete={isRegister ? 'new-password' : 'current-password'}
                 value={fields.password} onChange={setField('password')}
                 trailingLink={isRegister ? null : { text: _('Forgot password?'), onClick: (e) => { e.preventDefault(); setView('forgot'); setError(null); } }}
                 revealLabel={_('Show password')} hideLabel={_('Hide password')} />
          {isRegister && <Input label={_('First Name')} name="first_name" placeholder={_('First Name')} value={fields.first} onChange={setField('first')} />}
          {isRegister && <Input label={_('Last Name')} name="last_name" placeholder={_('Last Name')} value={fields.last} onChange={setField('last')} />}
          {isRegister && <div id="auth-captcha-slot" />}
          <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
            <span>{isRegister ? _('Create Account') : _('Sign In')}</span>
          </Button>
        </form>
        {legal}
      </AuthCard>
    );
  };

  const renderForgot = () => (
    <AuthCard dir={dir} onBack={() => { setView('email'); setError(null); }} backLabel={_('Back')}
      heading={_('Forgot Password?')}>
      {errorBanner}
      <form className="sefaria-auth-stack" onSubmit={submitForgot}>
        <Input label={_('Email Address')} type="email" name="email" dir="ltr"
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
  next: PropTypes.string,
  csrfToken: PropTypes.string,
  dir: PropTypes.oneOf(['ltr', 'rtl']),
};

export default AuthPage;
