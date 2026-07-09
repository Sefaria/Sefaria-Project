import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from '../common/AuthCard.jsx';
import Button from '../common/Button.jsx';

const ForgotSentView = ({ onSignIn }) => (
  <AuthCard heading={<InterfaceText>Reset Link Sent</InterfaceText>}
    sub={<InterfaceText>Check your email and follow the instructions to reset your password.</InterfaceText>}>
    <div className="sefaria-auth-stack">
      <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={onSignIn}>
        <InterfaceText>Log In</InterfaceText>
      </Button>
    </div>
  </AuthCard>
);

ForgotSentView.propTypes = {
  onSignIn: PropTypes.func.isRequired,
};

export default ForgotSentView;
