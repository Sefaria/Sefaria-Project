import React from 'react';
import PropTypes from 'prop-types';

const PROVIDERS = {
  google: { icon: 'google', defaultLabel: 'Continue with Google' },
  apple: { icon: 'apple', defaultLabel: 'Continue with Apple' },
};

/**
 * Custom provider button from Figma `Buttons [for now]` (node 185:52318).
 *
 * Google GIS does not expose a programmatic button-click API. For Google,
 * `sdkOverlayRef` hosts the transparent SDK-rendered click target above this visual.
 * Apple exposes `AppleID.auth.signIn()`, so its button uses `onClick` directly.
 */
const ProviderButton = ({
  provider,
  label,
  onClick,
  disabled = false,
  id,
  sdkOverlayRef = null,
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
      <span>{label || config.defaultLabel}</span>
    </>
  );

  if (sdkOverlayRef) {
    return (
      <div
        id={id}
        className={`sefaria-provider-button-shell${disabled ? ' is-disabled' : ''}`}
        tabIndex={-1}
      >
        <div className="sefaria-provider-button" aria-hidden="true">
          {content}
        </div>
        <div ref={sdkOverlayRef} className="sefaria-provider-sdk-overlay" />
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
  sdkOverlayRef: PropTypes.shape({ current: PropTypes.object }),
};

export default ProviderButton;
