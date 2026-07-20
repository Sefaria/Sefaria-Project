import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Button from '../common/Button.jsx';

const ForgotSentView = ({ onSignIn }) => (
  <AuthCard heading={<InterfaceText>Reset Link Sent</InterfaceText>}
    sub={<InterfaceText>Check your email and follow the instructions to reset your password.</InterfaceText>}>
  </AuthCard>
);

ForgotSentView.propTypes = {
  onSignIn: PropTypes.func.isRequired,
};

export default ForgotSentView;
