import React from 'react';
import PropTypes from 'prop-types';
import AuthCard from '../common/AuthCard.jsx';
import Divider from '../common/Divider.jsx';
import Button from '../common/Button.jsx';
import ProviderButton from '../common/ProviderButton.jsx';
import LegalText from '../common/LegalText.jsx';

const ChooseView = ({
  flow, switchFlow, errorBanner,
  googleClientId, appleClientId, googleReady, appleReady,
  googleBtnRef, startAppleSignIn, onEmailClick,
}) => (
  <AuthCard
    className="sefaria-auth-card--choose"
    heading={flow === 'login' ? Sefaria._('Sign In') : Sefaria._('Create an Account')}
    sub={flow === 'login'
      ? <>{Sefaria._("Don't have an account?")} <a href="/register" onClick={switchFlow('register')}>{Sefaria._('Sign Up')}</a></>
      : <>{Sefaria._('Already have an account?')} <a href="/login" onClick={switchFlow('login')}>{Sefaria._('Sign In')}</a></>}
  >
    {errorBanner}
    <div className="sefaria-auth-choose">
      <div className="sefaria-auth-sso-group">
        <div className="sefaria-auth-provider-options">
          {googleClientId && (
            <ProviderButton
              id="google-signin-button"
              provider="google"
              label={Sefaria._('Continue with Google')}
              disabled={!googleReady}
              sdkOverlayRef={googleBtnRef}
            />
          )}
          {appleClientId && (
            <ProviderButton
              id="apple-signin-button"
              provider="apple"
              label={Sefaria._('Continue with Apple')}
              disabled={!appleReady}
              onClick={startAppleSignIn}
            />
          )}
        </div>
        <Divider>{Sefaria._('or')}</Divider>
      </div>
      <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={onEmailClick}>
        <span>{Sefaria._('Continue with Email')}</span>
      </Button>
      <LegalText />
    </div>
  </AuthCard>
);

ChooseView.propTypes = {
  flow: PropTypes.oneOf(['login', 'register']).isRequired,
  switchFlow: PropTypes.func.isRequired,
  errorBanner: PropTypes.node,
  googleClientId: PropTypes.string,
  appleClientId: PropTypes.string,
  googleReady: PropTypes.bool.isRequired,
  appleReady: PropTypes.bool.isRequired,
  googleBtnRef: PropTypes.object.isRequired,
  startAppleSignIn: PropTypes.func.isRequired,
  onEmailClick: PropTypes.func.isRequired,
};

export default ChooseView;
