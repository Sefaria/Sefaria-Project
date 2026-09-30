import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import FormView from './FormView.jsx';
import PasswordInput from './PasswordInput.jsx';
import Button from '../common/Button.jsx';
import {
  authError, checkPasswordsMatch, postJson, onBlurValidate, onChangeClear,
} from './utils.js';

const ResetView = ({ csrf, onLinkExpired, onSuccess }) => {
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');

  const onSubmit = async () => {
    const mismatch = checkPasswordsMatch(password1, password2);
    if (mismatch || !password2) {
      return { fieldErrors: { password2: mismatch || 'auth.required_field' } };
    }
    const { ok, data } = await postJson(window.location.pathname, { new_password1: password1, new_password2: password2 }, csrf);
    if (ok) { onSuccess(); return; }
    if (data?._auth?.code === 'invalid_reset_link') { onLinkExpired(); return; }
    if (data?.new_password1 || data?.new_password2) {
      return { fieldErrors: { password1: data.new_password1 || null, password2: data.new_password2 || null } };
    }
    return { error: authError(data, 'auth.generic_error') };
  };

  // Only blurring Confirm (or submitting) may *set* the mismatch error — typing
  // may only *clear* it, the instant the two fields match again.
  const onPasswordChange = (setter, isPassword2, fieldErrors, setFieldError) => onChangeClear(
    'password2',
    (e) => setter(e.target.value),
    (value) => checkPasswordsMatch(isPassword2 ? password1 : value, isPassword2 ? value : password2),
    fieldErrors,
    setFieldError,
  );

  const onPassword2Blur = (setFieldError) => onBlurValidate(
    'password2',
    () => checkPasswordsMatch(password1, password2),
    setFieldError,
  );

  return (
    <FormView heading={<InterfaceText>auth.reset_password</InterfaceText>} formId="reset-form" onSubmit={onSubmit}>
      {({ fieldErrors, submitting, setFieldError }) => (
        <>
          <div className="sefaria-auth-fields">
            <PasswordInput label="auth.new_password" name="new_password1" autoComplete="new-password"
                   value={password1} onChange={onPasswordChange(setPassword1, false, fieldErrors, setFieldError)}
                   error={fieldErrors.password1} />
            <PasswordInput label="auth.confirm_new_password" name="new_password2" autoComplete="new-password"
                   value={password2} onChange={onPasswordChange(setPassword2, true, fieldErrors, setFieldError)}
                   onBlur={onPassword2Blur(setFieldError)}
                   error={fieldErrors.password2} />
          </div>
          <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
            <InterfaceText>auth.reset_password</InterfaceText>
          </Button>
        </>
      )}
    </FormView>
  );
};

ResetView.propTypes = {
  csrf: PropTypes.string.isRequired,
  onLinkExpired: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

export default ResetView;
