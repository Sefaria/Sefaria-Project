import React from 'react';
import PropTypes from 'prop-types';
import AuthCard from '../common/AuthCard.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';

const ForgotView = ({ errorBanner, emailValue, submitting, setField, submitForgot, onBack }) => (
  <AuthCard onBack={onBack} backLabel={Sefaria._('Back')}
    heading={Sefaria._('Forgot Password?')}>
    {errorBanner}
    <form className="sefaria-auth-email-form" onSubmit={submitForgot}>
      <Input label={Sefaria.interfaceLang === 'hebrew' ? Sefaria._('Auth Email') : Sefaria._('Email Address')} type="email" name="email"
             inputDir="ltr"
             value={emailValue} onChange={setField('email')} />
      <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
        <span>{Sefaria._('Send Reset Link')}</span>
      </Button>
    </form>
  </AuthCard>
);

ForgotView.propTypes = {
  errorBanner: PropTypes.node,
  emailValue: PropTypes.string.isRequired,
  submitting: PropTypes.bool.isRequired,
  setField: PropTypes.func.isRequired,
  submitForgot: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
};

export default ForgotView;
