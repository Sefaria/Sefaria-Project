import React from 'react';
import PropTypes from 'prop-types';
import {InterfaceText} from "../Misc";

/**
 * Divider — a horizontal rule with centered text ("or" / "או"), used between the
 * SSO buttons and the email button on the auth choose screen. Figma `Form Card`.
 */
const Divider = () => (
  <div className="sefaria-divider" role="separator"><InterfaceText>or</InterfaceText></div>
);

export default Divider;
