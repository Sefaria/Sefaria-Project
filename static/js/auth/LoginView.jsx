import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import FormView from './FormView.jsx';
import EmailInput from './EmailInput.jsx';
import PasswordInput from './PasswordInput.jsx';
import Button from '../common/Button.jsx';
import { authError, safeNext, postJson } from './utils.js';

const LoginView = ({ switchFlow, fields, setField, onBack, onProviderClick, onForgotClick, next, csrf }) => {
  const onSubmit = async () => {
    const { ok, data } = await postJson('/api/auth/login', { email: fields.email, password: fields.password }, csrf);
    if (ok) { window.location.href = safeNext(next); return; }
    return { error: authError(data, 'auth.invalid_credentials') };
  };

  return (
    <FormView cardClass="sefaria-auth-card--login-email" onBack={onBack}
      heading={<InterfaceText>header.log_in</InterfaceText>}
      sub={(
        <>
          <InterfaceText>auth.dont_have_an_account</InterfaceText>
          {' '}
          <a href="/register" onClick={switchFlow('register')}>
            <InterfaceText>header.sign_up</InterfaceText>
          </a>
        </>
      )}
      formId="login-form" onSubmit={onSubmit} onProviderClick={onProviderClick}
    >
      {({ submitting }) => (
        <>
          <div className="sefaria-auth-fields">
            <EmailInput value={fields.email} setField={setField} />
            <PasswordInput value={fields.password} onChange={setField('password')}
                   trailingLink={{ text: 'auth.forgot_password', onClick: onForgotClick }} />
          </div>
          <Button variant="sefaria-common-button auth-primary" size="fullwidth" disabled={submitting}>
            <InterfaceText>header.log_in</InterfaceText>
          </Button>
        </>
      )}
    </FormView>
  );
};

LoginView.propTypes = {
  switchFlow: PropTypes.func.isRequired,
  fields: PropTypes.shape({
    email: PropTypes.string.isRequired,
    password: PropTypes.string.isRequired,
  }).isRequired,
  setField: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  onProviderClick: PropTypes.func,
  onForgotClick: PropTypes.func.isRequired,
  next: PropTypes.string,
  csrf: PropTypes.string,
};

export default LoginView;
