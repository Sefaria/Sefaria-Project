import React, { useRef, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import FormView from './FormView.jsx';
import EmailInput from './EmailInput.jsx';
import PasswordInput from './PasswordInput.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';
import Captcha from '../common/Captcha.jsx';
import LegalText from './LegalText.jsx';
import { whenReady, pickFirstError, authError, postForm } from './utils.js';

// Shown in the banner (same shape LoginView's sso_only_account error already uses), not under
// the email field — ErrorBanner already knows how to render both of these.
const EMAIL_EXISTS_ERRORS = {
  'This email address is already registered via Google Sign-In.': { code: 'sso_only_account', providers: ['google'] },
  'This email address is already registered via Apple Sign-In.':  { code: 'sso_only_account', providers: ['apple'] },
  'An account with this email address already exists.':           { message: 'auth.email_exists_generic', linkText: 'auth.log_in_link' },
};

const FIELD_MAP = { email: 'email', password1: 'password', first_name: 'first', last_name: 'last' };
const BACKEND_MESSAGES = { 'This field is required.': 'auth.required_field' };

const RegisterView = ({
  switchFlow, fields, setField, onBack,
  startRegistration, trackRegistration, endRegistration, next, csrf,
  registerGoogleTarget, triggerApple, setActiveErrorHandler,
}) => {
  const [captchaError, setCaptchaError] = useState(null);
  const captchaToken = useRef('');
  const captchaWidgetId = useRef(null);
  const captchaObserver = useRef(null);

  const recaptchaSiteKey = Sefaria.recaptchaSiteKey;

  useEffect(() => {
    if (!recaptchaSiteKey) {
      captchaWidgetId.current = null;
      captchaToken.current = '';
      return;
    }

    // reCAPTCHA always renders a 304×78 px widget; scale the slot itself to fill its
    // container. Scaling the slot (not an inner div) guarantees the origin is always
    // at x=0 of the container, avoiding any offset introduced by Google's markup.
    const scaleWidget = () => {
      const slot = document.getElementById('auth-captcha-slot');
      if (!slot?.firstElementChild) return;
      const box = slot.parentElement;
      if (!box) return;
      const scale = box.offsetWidth / 304;
      // Use physical margins so the slot is always anchored to the physical left,
      // regardless of whether the page or the reCAPTCHA script sets direction:rtl/ltr.
      // On narrow (mobile) RTL layouts the gap is visible — anchor to the correct physical edge.
      const isRtl = getComputedStyle(slot).direction === 'rtl';
      slot.style.display = 'block';
      slot.style.width = '304px';
      slot.style.height = '78px';
      slot.style.marginLeft = isRtl ? 'auto' : '0';
      slot.style.marginRight = isRtl ? '0' : 'auto';
      slot.style.transform = `scale(${scale})`;
      slot.style.transformOrigin = isRtl ? 'right top' : 'left top';
      box.style.height = `${Math.round(78 * scale)}px`;
    };

    const renderWidget = () => {
      const slot = document.getElementById('auth-captcha-slot');
      if (!slot || captchaWidgetId.current !== null || !window.grecaptcha.render) return;
      try {
        captchaWidgetId.current = window.grecaptcha.render(slot, {
          sitekey: recaptchaSiteKey,
          callback: (t) => { captchaToken.current = t; },
          'expired-callback': () => { captchaToken.current = ''; },
        });
        scaleWidget();
        const box = slot.parentElement;
        if (box) {
          captchaObserver.current = new ResizeObserver(scaleWidget);
          captchaObserver.current.observe(box);
        }
      } catch (e) { /* not ready / already rendered */ }
    };

    const cancel = whenReady(
      () => window.grecaptcha?.render,
      () => {
        if (window.grecaptcha.ready) window.grecaptcha.ready(renderWidget);
        else renderWidget();
      },
    );

    return () => {
      cancel();
      captchaObserver.current?.disconnect();
      captchaObserver.current = null;
    };
  }, [recaptchaSiteKey]);

  const onSubmit = async () => {
    setCaptchaError(null);
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
    const { data, networkError } = await postForm('/register', body, csrf);
    if (networkError) {
      trackRegistration('form_submit_result', { status: 'failure', error: 'network_error' });
      return { error: authError(null, 'auth.generic_error') };
    }
    if (data?.redirect) {
      trackRegistration('form_submit_result', { status: 'success' });
      endRegistration('success');
      window.location.href = data.redirect;
      return;
    }
    const message = pickFirstError(data) || 'auth.generic_error';
    trackRegistration('form_submit_result', {
      status: 'failure',
      error: Object.keys(data || {}).filter((key) => key !== '_auth').map((key) => `${key}: ${data[key]}`).join(' | '),
    });
    const newFieldErrors = {};
    let hasUnknownError = false;
    let emailExistsError = null;
    for (const [key, val] of Object.entries(data || {})) {
      if (key === '_auth' || key === 'captcha') continue;
      if (FIELD_MAP[key]) {
        const raw = typeof val === 'string' ? val : String(val);
        if (FIELD_MAP[key] === 'email' && EMAIL_EXISTS_ERRORS[raw]) {
          emailExistsError = EMAIL_EXISTS_ERRORS[raw];
        } else {
          newFieldErrors[FIELD_MAP[key]] = BACKEND_MESSAGES[raw] || raw;
        }
      } else {
        hasUnknownError = true;
      }
    }
    if (data?.captcha) setCaptchaError('auth.verify_not_robot');
    if (window.grecaptcha && captchaWidgetId.current !== null) {
      try { window.grecaptcha.reset(captchaWidgetId.current); } catch (e2) { /* noop */ }
      captchaToken.current = '';
    }
    const hasAuthError = !!(data?._auth?.code);
    return {
      error: emailExistsError || ((hasAuthError || hasUnknownError) ? authError(data, message) : undefined),
      fieldErrors: newFieldErrors,
    };
  };

  return (
    <FormView cardClass="sefaria-auth-card--register-email" onBack={onBack}
      heading={<InterfaceText>auth.create_account</InterfaceText>}
      sub={(
        <>
          <InterfaceText>auth.already_have_an_account</InterfaceText>
          {' '}
          <a href="/login" onClick={switchFlow('login')}>
            <InterfaceText>auth.log_in_link</InterfaceText>
          </a>
        </>
      )}
      formId="register-form" onSubmit={onSubmit}
      registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple}
      setActiveErrorHandler={setActiveErrorHandler}
      onLinkClick={switchFlow('login')}
    >
      {({ fieldErrors, submitting }) => (
        <>
          <div className="sefaria-auth-fields">
            <EmailInput value={fields.email} setField={setField} onFocus={startRegistration} error={fieldErrors.email} />
            <PasswordInput autoComplete="new-password"
                   value={fields.password} onChange={setField('password')} onFocus={startRegistration}
                   error={fieldErrors.password} />
            <Input label="common.first_name" placeholder={Sefaria._('common.first_name')} name="first_name"
                   value={fields.first} onChange={setField('first')} onFocus={startRegistration} error={fieldErrors.first} />
            <Input label="common.last_name" placeholder={Sefaria._('common.last_name')} name="last_name"
                   value={fields.last} onChange={setField('last')} onFocus={startRegistration} error={fieldErrors.last} />
          </div>
          {recaptchaSiteKey && (
            <Captcha error={captchaError}>
              <div id="auth-captcha-slot" />
            </Captcha>
          )}
          <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
            <InterfaceText>auth.create_account</InterfaceText>
          </Button>
          <LegalText />
        </>
      )}
    </FormView>
  );
};

RegisterView.propTypes = {
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
  next: PropTypes.string,
  csrf: PropTypes.string,
  registerGoogleTarget: PropTypes.func,
  triggerApple: PropTypes.func,
  setActiveErrorHandler: PropTypes.func,
};

export default RegisterView;
