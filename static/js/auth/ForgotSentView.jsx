import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Button from '../common/Button.jsx';

const ForgotSentView = ({ onSignIn }) => (
  <AuthCard heading={<InterfaceText>auth.reset_link_sent</InterfaceText>}
    sub={<InterfaceText>auth.check_your_email</InterfaceText>}>
  </AuthCard>
);

ForgotSentView.propTypes = {
  onSignIn: PropTypes.func.isRequired,
};

export default ForgotSentView;
