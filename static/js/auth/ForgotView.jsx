import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';
import ErrorBanner from './ErrorBanner.jsx';

const ForgotView = ({ error, emailValue, submitting, setField, submitForgot, onBack }) => (
  <AuthCard onBack={onBack} backLabel={Sefaria._('Back')}
    heading={<InterfaceText>Forgot Password?</InterfaceText>}>
    <ErrorBanner error={error} />
    <form className="sefaria-auth-email-form" onSubmit={submitForgot}>
      <Input label={Sefaria._('Email Address', 'Auth')} type="email" name="email"
             inputDir="ltr"
             value={emailValue} onChange={setField('email')} />
      <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
        <InterfaceText>Send Reset Link</InterfaceText>
      </Button>
    </form>
  </AuthCard>
);

ForgotView.propTypes = {
  error: PropTypes.shape({
    message: PropTypes.string.isRequired,
    code: PropTypes.string,
    providers: PropTypes.arrayOf(PropTypes.string),
  }),
  emailValue: PropTypes.string.isRequired,
  submitting: PropTypes.bool.isRequired,
  setField: PropTypes.func.isRequired,
  submitForgot: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
};

export default ForgotView;
