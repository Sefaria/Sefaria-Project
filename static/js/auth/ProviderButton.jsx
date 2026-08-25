import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';

const PROVIDERS = {
  google: { icon: 'google', defaultLabel: 'auth.continue_with_google' },
  apple: { icon: 'apple', defaultLabel: 'auth.continue_with_apple' },
};

/**
 * Custom provider button from Figma `Buttons [for now]` (node 185:52318).
 *
 * Google's rendered button lives in a cross-origin (accounts.google.com) iframe — a click can
 * only ever be received by that iframe's actual on-screen position, so this component doesn't
 * handle the click itself for Google. Instead `trackingRef` forwards to the shell so the one
 * real (invisible, elsewhere-mounted) Google button can be positioned exactly on top of it —
 * see `useProviderTriggers` (`useSsoSignIn.jsx`). Apple exposes `AppleID.auth.signIn()`
 * directly, so its button just uses `onClick`.
 */
const ProviderButton = ({
  provider,
  label,
  onClick,
  disabled = false,
  id,
  trackingRef = null,
}) => {
  const config = PROVIDERS[provider];
  if (!config) return null;

  const content = (
    <>
      <img
        src={`/static/icons/${config.icon}.svg`}
        className="sefaria-provider-button-icon"
        alt=""
        aria-hidden="true"
      />
      <InterfaceText>{label || config.defaultLabel}</InterfaceText>
    </>
  );

  if (trackingRef) {
    return (
      <div
        id={id}
        ref={trackingRef}
        className={`sefaria-provider-button-shell${disabled ? ' is-disabled' : ''}`}
        tabIndex={-1}
      >
        <div className="sefaria-provider-button" aria-hidden="true">
          {content}
        </div>
      </div>
    );
  }

  return (
    <button
      id={id}
      type="button"
      className="sefaria-provider-button"
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
};

ProviderButton.propTypes = {
  provider: PropTypes.oneOf(['google', 'apple']).isRequired,
  label: PropTypes.string,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  id: PropTypes.string,
  trackingRef: PropTypes.func,
};

export default ProviderButton;
