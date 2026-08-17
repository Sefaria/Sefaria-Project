import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import FormView from './FormView.jsx';
import EmailInput from './EmailInput.jsx';
import PasswordInput from './PasswordInput.jsx';
import Button from '../common/Button.jsx';
import { authError, safeNext, postJson } from './utils.js';

const LoginView = ({
  switchFlow, fields, setField, onBack, onForgotClick, endProcess, next, csrf,
  registerGoogleTarget, triggerApple, setActiveErrorHandler,
}) => {
  const onSubmit = async () => {
    const { ok, data } = await postJson('/api/auth/login', { email: fields.email, password: fields.password }, csrf);
    if (ok) {
      endProcess('success', null, 'existing_user_login');
      window.location.href = safeNext(next);
      return;
    }
    const error = authError(data, 'auth.invalid_credentials');
    endProcess('failure', error.code || 'invalid_credentials');
    return { error };
  };

  return (
    <FormView cardClass="sefaria-auth-card--login-email" onBack={onBack}
      heading={<InterfaceText>header.log_in</InterfaceText>}
      sub={(
        <>
          <InterfaceText>auth.dont_have_an_account</InterfaceText>
          {' '}
          <a href="/register" data-signup-source="login_crosslink" onClick={switchFlow('register')}>
            <InterfaceText>header.sign_up</InterfaceText>
          </a>
        </>
      )}
      formId="login-form" onSubmit={onSubmit}
      registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple}
      setActiveErrorHandler={setActiveErrorHandler}
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
  onForgotClick: PropTypes.func.isRequired,
  endProcess: PropTypes.func.isRequired,
  next: PropTypes.string,
  csrf: PropTypes.string,
  registerGoogleTarget: PropTypes.func,
  triggerApple: PropTypes.func,
  setActiveErrorHandler: PropTypes.func,
};

export default LoginView;
