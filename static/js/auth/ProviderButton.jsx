import React from 'react';
import PropTypes from 'prop-types';
import Sefaria from '../sefaria/sefaria';
import { InterfaceText } from '../Misc.jsx';

const PROVIDERS = {
  google: { icon: 'google', defaultLabel: 'auth.continue_with_google' },
  apple: { icon: 'apple', defaultLabel: 'auth.continue_with_apple' },
  email: { icon: 'email', defaultLabel: 'auth.continue_with_email' },
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
 *
 * `variant="icon"`: a round button with the icon only, its label read out instead of shown
 * (SignupOptions).
 */
const ProviderButton = ({
  provider,
  label,
  onClick,
  disabled = false,
  id,
  trackingRef = null,
  variant = 'standard',
  featureName,
}) => {
  const config = PROVIDERS[provider];
  if (!config) return null;

  const text = label || config.defaultLabel;
  const isIcon = variant === 'icon';
  const variantClass = isIcon ? ' sefaria-provider-button--icon' : '';
  const content = (
    <>
      <img
        src={`/static/icons/${config.icon}.svg`}
        className="sefaria-provider-button-icon"
        alt=""
        aria-hidden="true"
      />
      {!isIcon && <InterfaceText>{text}</InterfaceText>}
    </>
  );

  if (trackingRef) {
    return (
      <div
        id={id}
        ref={trackingRef}
        className={`sefaria-provider-button-shell${isIcon ? ' sefaria-provider-button-shell--icon' : ''}${disabled ? ' is-disabled' : ''}`}
        data-provider={provider}
        data-feature-name={featureName}
        tabIndex={-1}
      >
        <div className={`sefaria-provider-button${variantClass}`} aria-hidden="true">
          {content}
        </div>
      </div>
    );
  }

  return (
    <button
      id={id}
      type="button"
      className={`sefaria-provider-button${variantClass}`}
      data-provider={provider}
      data-feature-name={featureName}
      aria-label={isIcon ? Sefaria._(text) : undefined}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
};

ProviderButton.propTypes = {
  provider: PropTypes.oneOf(['google', 'apple', 'email']).isRequired,
  label: PropTypes.string,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  id: PropTypes.string,
  trackingRef: PropTypes.func,
  variant: PropTypes.oneOf(['standard', 'icon']),
  // For a host's click analytics (e.g. the Library Assistant's `data-feature-name` clicks).
  featureName: PropTypes.string,
};

export default ProviderButton;
