import React from 'react';
import PropTypes from 'prop-types';
import AuthCard from '../common/AuthCard.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';
import Captcha from '../common/Captcha.jsx';

const EmailView = ({
  dir, flow, switchFlow, errorBanner, legal,
  fields, submitting, captchaError, setField,
  goChoose, submitEmail, startRegistration,
  recaptchaSiteKey, onForgotClick,
}) => {
  const isRegister = flow === 'register';
  return (
    <AuthCard
      className={[
        isRegister ? 'sefaria-auth-card--register-email' : 'sefaria-auth-card--login-email',
        errorBanner || captchaError ? 'sefaria-auth-card--email-error' : '',
      ].filter(Boolean).join(' ')}
      dir={dir}
      onBack={goChoose}
      backLabel={Sefaria._('Back')}
      heading={isRegister ? Sefaria._('Create an Account') : Sefaria._('Sign In')}
      sub={isRegister
        ? <>{Sefaria._('Already have an account?')} <a href="/login" onClick={switchFlow('login')}>{Sefaria._('Sign In')}</a></>
        : <>{Sefaria._("Don't have an account?")} <a href="/register" onClick={switchFlow('register')}>{Sefaria._('Sign Up')}</a></>}
    >
      <form id={isRegister ? 'register-form' : 'login-form'} className="sefaria-auth-email-form" onSubmit={submitEmail}>
        {errorBanner}
        <div className="sefaria-auth-fields">
          <Input label={dir === 'rtl' ? Sefaria._('Auth Email') : Sefaria._('Email Address')} type="email" name="email"
                 dir={dir} inputDir="ltr" autoComplete="email"
                 placeholder="you@example.com" value={fields.email} onChange={setField('email')}
                 onFocus={isRegister ? startRegistration : undefined} />
          <Input label={dir === 'rtl' ? Sefaria._('Auth Password') : Sefaria._('Password')} type="password" name="password"
                 dir={dir} inputDir="ltr"
                 autoComplete={isRegister ? 'new-password' : 'current-password'}
                 value={fields.password} onChange={setField('password')}
                 onFocus={isRegister ? startRegistration : undefined}
                 trailingLink={isRegister ? null : { text: dir === 'rtl' ? Sefaria._('Auth Forgot password?') : Sefaria._('Forgot password?'), onClick: onForgotClick }}
                 revealLabel={Sefaria._('Show password')} hideLabel={Sefaria._('Hide password')} />
          {isRegister && <Input dir={dir} label={Sefaria._('First Name')} name="first_name" placeholder={Sefaria._('First Name')} value={fields.first} onChange={setField('first')} onFocus={startRegistration} />}
          {isRegister && <Input dir={dir} label={Sefaria._('Last Name')} name="last_name" placeholder={Sefaria._('Last Name')} value={fields.last} onChange={setField('last')} onFocus={startRegistration} />}
        </div>
        {isRegister && recaptchaSiteKey && (
          <Captcha error={captchaError}>
            <div id="auth-captcha-slot" />
          </Captcha>
        )}
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
          <span>{isRegister ? Sefaria._('Create Account') : Sefaria._('Sign In')}</span>
        </Button>
        {legal}
      </form>
    </AuthCard>
  );
};

EmailView.propTypes = {
  dir: PropTypes.oneOf(['ltr', 'rtl']),
  flow: PropTypes.oneOf(['login', 'register']).isRequired,
  switchFlow: PropTypes.func.isRequired,
  errorBanner: PropTypes.node,
  legal: PropTypes.node.isRequired,
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
