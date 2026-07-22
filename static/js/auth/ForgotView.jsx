import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import FormView from './FormView.jsx';
import EmailInput from './EmailInput.jsx';
import Button from '../common/Button.jsx';
import { authError, postJson } from './utils.js';

const ForgotView = ({ emailValue, setField, csrf, onSuccess, onBack }) => {
  const onSubmit = async () => {
    const { ok, data } = await postJson('/api/auth/password/reset', { email: emailValue }, csrf);
    if (ok) { onSuccess(); return; }
    return { error: authError(data, 'auth.generic_error') };
  };

  return (
    <FormView onBack={onBack} heading={<InterfaceText>auth.forgot_password</InterfaceText>}
      formId="forgot-form" onSubmit={onSubmit}
    >
      {({ submitting }) => (
        <>
          <EmailInput value={emailValue} setField={setField} />
          <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
            <InterfaceText>auth.send_reset_link</InterfaceText>
          </Button>
        </>
      )}
    </FormView>
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
