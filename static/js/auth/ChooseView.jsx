import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Divider from './Divider.jsx';
import Button from '../common/Button.jsx';
import ProviderButton from './ProviderButton.jsx';
import LegalText from './LegalText.jsx';
import ErrorBanner from './ErrorBanner.jsx';

const ChooseView = ({
  flow, switchFlow, error, onProviderClick,
  googleClientId, appleClientId, googleReady, appleReady,
  googleBtnRef, startAppleSignIn, onEmailClick,
}) => (
  <AuthCard
    className="sefaria-auth-card--choose"
    heading={flow === 'login'
      ? <InterfaceText>Log In</InterfaceText>
      : <InterfaceText context="Auth">Sign Up</InterfaceText>}
    sub={flow === 'login'
      ? (
        <>
          <InterfaceText>{"Don't have an account?"}</InterfaceText>
          {' '}
          <a href="/register" onClick={switchFlow('register')}>
            <InterfaceText>Sign Up</InterfaceText>
          </a>
        </>
      ) : (
        <>
          <InterfaceText>Already have an account?</InterfaceText>
          {' '}
          <a href="/login" onClick={switchFlow('login')}>
            <InterfaceText context="Auth">Log In</InterfaceText>
          </a>
        </>
      )}
  >
    <ErrorBanner error={error} onProviderClick={onProviderClick} />
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
        <Divider><InterfaceText>or</InterfaceText></Divider>
      </div>
      <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={onEmailClick}>
        <InterfaceText>Continue with Email</InterfaceText>
      </Button>
      <LegalText />
    </div>
  </AuthCard>
);

ChooseView.propTypes = {
  flow: PropTypes.oneOf(['login', 'register']).isRequired,
  switchFlow: PropTypes.func.isRequired,
  error: PropTypes.shape({
    message: PropTypes.string.isRequired,
    code: PropTypes.string,
    providers: PropTypes.arrayOf(PropTypes.string),
  }),
  onProviderClick: PropTypes.func,
  googleClientId: PropTypes.string,
  appleClientId: PropTypes.string,
  googleReady: PropTypes.bool.isRequired,
  appleReady: PropTypes.bool.isRequired,
  googleBtnRef: PropTypes.object.isRequired,
  startAppleSignIn: PropTypes.func.isRequired,
  onEmailClick: PropTypes.func.isRequired,
};

export default ChooseView;
