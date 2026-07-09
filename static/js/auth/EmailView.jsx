import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';
import Captcha from '../common/Captcha.jsx';
import LegalText from './LegalText.jsx';
import ErrorBanner from './ErrorBanner.jsx';

const EmailView = ({
  flow, switchFlow, error, onProviderClick,
  fields, submitting, captchaError, setField,
  goChoose, submitEmail, startRegistration,
  recaptchaSiteKey, onForgotClick,
}) => {
  const isRegister = flow === 'register';
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
      onBack={goChoose}
      backLabel={Sefaria._('Back')}
      heading={cfg.heading}
      sub={cfg.sub}
    >
      <form id={cfg.formId} className="sefaria-auth-email-form" onSubmit={submitEmail}>
        <ErrorBanner error={error} onProviderClick={onProviderClick} />
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
  error: PropTypes.shape({
    message: PropTypes.string.isRequired,
    code: PropTypes.string,
    providers: PropTypes.arrayOf(PropTypes.string),
  }),
  onProviderClick: PropTypes.func,
  fields: PropTypes.shape({
    email: PropTypes.string.isRequired,
    password: PropTypes.string.isRequired,
    first: PropTypes.string.isRequired,
    last: PropTypes.string.isRequired,
  }).isRequired,
  submitting: PropTypes.bool.isRequired,
  captchaError: PropTypes.string,
  setField: PropTypes.func.isRequired,
  goChoose: PropTypes.func.isRequired,
  submitEmail: PropTypes.func.isRequired,
  startRegistration: PropTypes.func.isRequired,
  recaptchaSiteKey: PropTypes.string,
  onForgotClick: PropTypes.func.isRequired,
};

export default EmailView;
