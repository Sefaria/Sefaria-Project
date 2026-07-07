import React from 'react';
import PropTypes from 'prop-types';

/**
 * Divider — a horizontal rule with centered text ("or" / "או"), used between the
 * SSO buttons and the email button on the auth choose screen. Figma `Form Card`.
 */
const Divider = ({ children }) => (
  <div className="sefaria-divider" role="separator">{children}</div>
);

Divider.propTypes = { children: PropTypes.node };

export default Divider;
