import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/**
 * AuthCard — the white auth panel (Figma `Form Card`) that floats on the navy
 * source-connections background. Holds a serif heading, an optional cross-flow
 * sub-line, an optional back button (shown on the email/content-swap step), and
 * arbitrary children (buttons or a form).
 *
 * AuthPage swaps between view components (ChooseView/LoginView/RegisterView/...)
 * rather than navigating pages, so each transition -- including the back button,
 * which just swaps to a different view component too -- mounts a fresh AuthCard.
 * Focusing the heading on mount (tabIndex={-1}, not in normal tab order) gives
 * every one of those transitions the same "you're now here" cue a real page
 * navigation would via the browser's title/focus reset, which this SPA-style
 * swap doesn't get for free.
 *
 * Responsive: full-bleed on mobile (≤842px) via CSS; ~460px card on desktop.
 *
 * @param heading  serif title ("Sign In" / "Create an Account")
 * @param sub      sub-line node (e.g. "Don't have an account? <a>Sign Up</a>")
 * @param onBack   if provided, renders the back arrow (content-swap step)
 * @param backLabel aria-label for the back button (localized)
 */
const AuthCard = ({ heading, sub, onBack, backLabel = 'auth.back', className = '', children }) => {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={`sefaria-auth-card ${className}`.trim()}>
      {onBack && (
        <button type="button" className="sefaria-auth-card-back" onClick={onBack} aria-label={Sefaria._(backLabel)}>
          <img src="/static/icons/arrow-left.svg" alt="" aria-hidden="true" />
        </button>
      )}
      {(heading || sub) && (
        <div className="sefaria-auth-card-header">
          {heading && <h1 ref={headingRef} tabIndex={-1} className="sefaria-auth-card-heading">{heading}</h1>}
          {sub && <div className="sefaria-auth-card-sub">{sub}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

AuthCard.propTypes = {
  heading: PropTypes.node,
  sub: PropTypes.node,
  onBack: PropTypes.func,
  backLabel: PropTypes.string,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default AuthCard;
