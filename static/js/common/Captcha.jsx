import React from 'react';
import PropTypes from 'prop-types';

/**
 * Captcha — wraps the reCAPTCHA widget (passed as children) and adds the error
 * state the design system was missing: a red outline around the box + an inline
 * message. Presentational; the actual reCAPTCHA element is rendered by the consumer.
 * Figma `Legal Text & Recaptcha Error State` (node 192:6701).
 *
 * @param error  error message string, or null/empty for no error
 */
const Captcha = ({ error = null, errorLabel, children }) => (
  <div className={`sefaria-captcha${error ? ' sefaria-captcha--error' : ''}`}>
    <div className="sefaria-captcha-box">{children}</div>
    {error && (
      <div className="sefaria-captcha-error" role="alert">
        <img src="/static/icons/info.svg" alt="" aria-hidden="true" />
        <span>{errorLabel || error}</span>
      </div>
    )}
  </div>
);

Captcha.propTypes = {
  error: PropTypes.string,
  errorLabel: PropTypes.string,
  children: PropTypes.node,
};

export default Captcha;
