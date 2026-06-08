import React from 'react';
import PropTypes from 'prop-types';

/**
 * AuthCard — the white auth panel (Figma `Form Card`) that floats on the navy
 * source-connections background. Holds a serif heading, an optional cross-flow
 * sub-line, an optional back button (shown on the email/content-swap step), and
 * arbitrary children (buttons or a form).
 *
 * Responsive: full-bleed on mobile (≤842px) via CSS; ~460px card on desktop.
 *
 * @param heading  serif title ("Sign In" / "Create an Account")
 * @param sub      sub-line node (e.g. "Don't have an account? <a>Sign Up</a>")
 * @param onBack   if provided, renders the back arrow (content-swap step)
 * @param backLabel aria-label for the back button (localized)
 * @param dir      "ltr" | "rtl"
 */
const AuthCard = ({ heading, sub, onBack, backLabel = 'Back', dir, children }) => (
  <div className="sefaria-auth-card" dir={dir}>
    {onBack && (
      <button type="button" className="sefaria-auth-card-back" onClick={onBack} aria-label={backLabel}>
        <img src="/static/icons/arrow-left.svg" alt="" aria-hidden="true" />
      </button>
    )}
    {heading && <h1 className="sefaria-auth-card-heading">{heading}</h1>}
    {sub && <div className="sefaria-auth-card-sub">{sub}</div>}
    {children}
  </div>
);

AuthCard.propTypes = {
  heading: PropTypes.node,
  sub: PropTypes.node,
  onBack: PropTypes.func,
  backLabel: PropTypes.string,
  dir: PropTypes.oneOf(['ltr', 'rtl']),
  children: PropTypes.node,
};

export default AuthCard;
