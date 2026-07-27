import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Divider from './Divider.jsx';
import Button from '../common/Button.jsx';
import ProviderButton from './ProviderButton.jsx';
import LegalText from './LegalText.jsx';
import ErrorBanner from './ErrorBanner.jsx';

const ChooseView = ({
  flow, switchFlow, onEmailClick,
  googleReady, appleReady, registerGoogleTarget, triggerApple, setActiveErrorHandler,
}) => {
  const [error, setError] = useState(null);
  const { googleClientId, appleClientId } = Sefaria;

  useEffect(() => {
    setActiveErrorHandler?.(setError);
    return () => setActiveErrorHandler?.(null);
  }, [setActiveErrorHandler]);

  const isLogin = flow === 'login';
  const heading = isLogin
    ? <InterfaceText>header.log_in</InterfaceText>
    : <InterfaceText>auth.create_account</InterfaceText>;
  const sub = isLogin
    ? (
      <>
        <InterfaceText>auth.dont_have_an_account</InterfaceText>
        {' '}
        <a href="/register" onClick={switchFlow('register')}>
          <InterfaceText>header.sign_up</InterfaceText>
        </a>
      </>
    ) : (
      <>
        <InterfaceText>auth.already_have_an_account</InterfaceText>
        {' '}
        <a href="/login" onClick={switchFlow('login')}>
          <InterfaceText>auth.log_in_link</InterfaceText>
        </a>
      </>
    );

  return (
    <AuthCard
      className="sefaria-auth-card--choose"
      heading={heading}
      sub={sub}
    >
      <ErrorBanner error={error} registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple} />
      <div className="sefaria-auth-choose">
        <div className="sefaria-auth-sso-group">
          <div className="sefaria-auth-provider-options">
            {googleClientId && (
              <ProviderButton
                id="google-signin-button"
                provider="google"
                label="auth.continue_with_google"
                disabled={!googleReady}
                trackingRef={registerGoogleTarget}
              />
            )}
            {appleClientId && (
              <ProviderButton
                id="apple-signin-button"
                provider="apple"
                label="auth.continue_with_apple"
                disabled={!appleReady}
                onClick={triggerApple}
              />
            )}
          </div>
        </div>
        <Divider/>
        <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={onEmailClick}>
          <InterfaceText>auth.continue_with_email</InterfaceText>
        </Button>
        <LegalText />
      </div>
    </AuthCard>
  );
};

ChooseView.propTypes = {
  flow: PropTypes.oneOf(['login', 'register']).isRequired,
  switchFlow: PropTypes.func.isRequired,
  onEmailClick: PropTypes.func.isRequired,
  googleReady: PropTypes.bool,
  appleReady: PropTypes.bool,
  registerGoogleTarget: PropTypes.func,
  triggerApple: PropTypes.func,
  setActiveErrorHandler: PropTypes.func,
};

export default ChooseView;
