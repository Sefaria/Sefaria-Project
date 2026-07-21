import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import EmailInput from './EmailInput.jsx';
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
        setError(authError(d, 'auth.generic_error'));
      }
    } catch (e) { setError(authError(null, 'auth.generic_error'));
    } finally { setSubmitting(false); }
  };

  return (
    <AuthCard onBack={handleBack} heading={<InterfaceText>auth.forgot_password</InterfaceText>}>
      <ErrorBanner error={error} />
      <form className="sefaria-auth-email-form" onSubmit={submitForgot}>
        <EmailInput value={emailValue} setField={setField} />
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
          <InterfaceText>auth.send_reset_link</InterfaceText>
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
