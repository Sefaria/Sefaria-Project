import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Input from '../common/Input.jsx';
import Button from '../common/Button.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { authError } from './utils.js';

const ForgotView = ({ emailValue, setField, csrf, onSuccess, onBack }) => {
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleBack = () => { setError(null); onBack(); };

  const submitForgot = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ email: emailValue }),
      });
      if (res.ok) { onSuccess(); }
      else {
        const d = await res.json().catch(() => ({}));
        setError(authError(d, 'Something went wrong. Try again.'));
      }
    } catch (e) { setError(authError(null, 'Something went wrong. Try again.'));
    } finally { setSubmitting(false); }
  };

  return (
    <AuthCard onBack={handleBack} backLabel={Sefaria._('Back')}
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
};

ForgotView.propTypes = {
  emailValue: PropTypes.string.isRequired,
  setField: PropTypes.func.isRequired,
  csrf: PropTypes.string.isRequired,
  onSuccess: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
};

export default ForgotView;
