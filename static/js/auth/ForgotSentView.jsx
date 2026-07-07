import React from 'react';
import PropTypes from 'prop-types';
import AuthCard from '../common/AuthCard.jsx';
import Button from '../common/Button.jsx';

const ForgotSentView = ({ dir, onSignIn }) => (
  <AuthCard dir={dir} heading={Sefaria._('Reset Link Sent')}
    sub={Sefaria._('Check your email and follow the instructions to reset your password.')}>
    <div className="sefaria-auth-stack">
      <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={onSignIn}>
        <span>{Sefaria._('Sign In')}</span>
      </Button>
    </div>
  </AuthCard>
);

ForgotSentView.propTypes = {
  dir: PropTypes.oneOf(['ltr', 'rtl']),
  onSignIn: PropTypes.func.isRequired,
};

export default ForgotSentView;
