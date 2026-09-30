import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';

/**
 * Generic terminal-message card (heading + sub + optional content, e.g. a
 * button) — used for every AuthPage state that's just "here's what happened",
 * not a form: reset-link-sent, resend-link-sent, password-reset-successfully.
 */
const MessageView = ({ heading, sub, children }) => (
  <AuthCard className="sefaria-message-view"
    heading={<InterfaceText>{heading}</InterfaceText>}
    sub={sub && <InterfaceText>{sub}</InterfaceText>}>
    {children}
  </AuthCard>
);

MessageView.propTypes = {
  heading: PropTypes.string.isRequired,
  sub: PropTypes.string,
  children: PropTypes.node,
};

export default MessageView;
