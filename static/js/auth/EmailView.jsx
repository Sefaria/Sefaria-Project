import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';
import Captcha from '../common/Captcha.jsx';
import LegalText from './LegalText.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { whenReady, pickFirstError, authError } from './utils.js';

const EmailView = ({
  flow, switchFlow, fields, setField,
  onBack, startRegistration, trackRegistration, endRegistration,
  onForgotClick, next, csrf,
}) => {
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaError, setCaptchaError] = useState(null);
  const captchaToken = useRef('');
  const captchaWidgetId = useRef(null);

  const isRegister = flow === 'register';
  const recaptchaSiteKey = Sefaria.recaptchaSiteKey;

  useEffect(() => {
    if (!isRegister || !recaptchaSiteKey) {
      captchaWidgetId.current = null;
      captchaToken.current = '';
      return;
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
      () => window.grecaptcha?.render,
      () => {
        if (window.grecaptcha.ready) window.grecaptcha.ready(renderWidget);
        else renderWidget();
      },
    );
  }, [isRegister, recaptchaSiteKey]);

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
        if (data?.redirect) {
          trackRegistration('form_submit_result', { status: 'success' });
          endRegistration('success');
          window.location.href = data.redirect;
          return;
        }
        const message = pickFirstError(data) || 'Something went wrong. Try again.';
        trackRegistration('form_submit_result', {
          status: 'failure',
          error: Object.keys(data || {}).filter((key) => key !== '_auth').map((key) => `${key}: ${data[key]}`).join(' | '),
        });
        const hasCaptchaError = !!(data?.captcha);
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

  const cfg = isRegister ? {
    cardClass: 'sefaria-auth-card--register-email',
    heading: <InterfaceText context="Auth">Sign Up</InterfaceText>,
    sub: (
      <>
        <InterfaceText>Already have an account?</InterfaceText>
        {' '}
        <a href="/login" onClick={switchFlow('login')}>
          <InterfaceText context="Auth">Log In</InterfaceText>
        </a>
      </>
    ),
    formId: 'register-form',
    emailOnFocus: startRegistration,
    passwordAutoComplete: 'new-password',
    passwordOnFocus: startRegistration,
    passwordTrailingLink: null,
    buttonText: <InterfaceText>Create Account</InterfaceText>,
  } : {
    cardClass: 'sefaria-auth-card--login-email',
    heading: <InterfaceText>Log In</InterfaceText>,
    sub: (
      <>
        <InterfaceText>{"Don't have an account?"}</InterfaceText>
        {' '}
        <a href="/register" onClick={switchFlow('register')}>
          <InterfaceText>Sign Up</InterfaceText>
        </a>
      </>
    ),
    formId: 'login-form',
    emailOnFocus: undefined,
    passwordAutoComplete: 'current-password',
    passwordOnFocus: undefined,
    passwordTrailingLink: { text: Sefaria._('Forgot password?'), onClick: onForgotClick },
    buttonText: <InterfaceText>Log In</InterfaceText>,
  };

  return (
    <AuthCard
      className={[cfg.cardClass, error || captchaError ? 'sefaria-auth-card--email-error' : ''].filter(Boolean).join(' ')}
      onBack={onBack}
      backLabel={Sefaria._('Back')}
      heading={cfg.heading}
      sub={cfg.sub}
    >
      <form id={cfg.formId} className="sefaria-auth-email-form" onSubmit={submitEmail}>
        <ErrorBanner error={error} />
        <div className="sefaria-auth-fields">
          <Input label={Sefaria._('Email Address', 'Auth')} type="email" name="email"
                 inputDir="ltr" autoComplete="email"
                 placeholder="you@example.com" value={fields.email} onChange={setField('email')}
                 onFocus={cfg.emailOnFocus} />
          <Input label={Sefaria._('Password')} type="password" name="password"
                 inputDir="ltr" autoComplete={cfg.passwordAutoComplete}
                 value={fields.password} onChange={setField('password')}
                 onFocus={cfg.passwordOnFocus} trailingLink={cfg.passwordTrailingLink}
                 revealLabel={Sefaria._('Show password')} hideLabel={Sefaria._('Hide password')} />
          {isRegister && <Input label={Sefaria._('First Name')} name="first_name" placeholder={Sefaria._('First Name')} value={fields.first} onChange={setField('first')} onFocus={startRegistration} />}
          {isRegister && <Input label={Sefaria._('Last Name')} name="last_name" placeholder={Sefaria._('Last Name')} value={fields.last} onChange={setField('last')} onFocus={startRegistration} />}
        </div>
        {isRegister && recaptchaSiteKey && (
          <Captcha error={captchaError}>
            <div id="auth-captcha-slot" />
          </Captcha>
        )}
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
          {cfg.buttonText}
        </Button>
        <LegalText />
      </form>
    </AuthCard>
  );
};

EmailView.propTypes = {
  flow: PropTypes.oneOf(['login', 'register']).isRequired,
  switchFlow: PropTypes.func.isRequired,
  fields: PropTypes.shape({
    email: PropTypes.string.isRequired,
    password: PropTypes.string.isRequired,
    first: PropTypes.string.isRequired,
    last: PropTypes.string.isRequired,
  }).isRequired,
  setField: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  startRegistration: PropTypes.func.isRequired,
  trackRegistration: PropTypes.func.isRequired,
  endRegistration: PropTypes.func.isRequired,
  onForgotClick: PropTypes.func.isRequired,
  next: PropTypes.string,
  csrf: PropTypes.string,
};

export default EmailView;
