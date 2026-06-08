import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button.jsx';

/**
 * ProviderButton — "Continue with Google" / "Continue with Apple".
 *
 * A CUSTOM Sefaria button (secondary variant: white fill, bordered, provider icon,
 * BLACK text per the Figma note), NOT the SDK-rendered Google/Apple chrome. On click it
 * triggers the provider SDK via `onClick`. Follow Google/Apple branding guidelines for
 * icon, wording, and min size. Figma `Buttons [for now]` node 187:76568.
 *
 * @param provider "google" | "apple"
 * @param label    button label (localized); defaults to "Continue with Google/Apple"
 * @param onClick  invoked on click — wire this to the provider SDK trigger
 * @param disabled disables the button
 */
const PROVIDERS = {
  google: { icon: 'google', defaultLabel: 'Continue with Google' },
  apple: { icon: 'apple', defaultLabel: 'Continue with Apple' },
};

const ProviderButton = ({ provider, label, onClick, disabled = false }) => {
  const cfg = PROVIDERS[provider];
  if (!cfg) return null;
  return (
    <Button
      variant="sefaria-common-button auth-secondary"
      size="fullwidth"
      icon={cfg.icon}
      onClick={onClick}
      disabled={disabled}
    >
      <span>{label || cfg.defaultLabel}</span>
    </Button>
  );
};

ProviderButton.propTypes = {
  provider: PropTypes.oneOf(['google', 'apple']).isRequired,
  label: PropTypes.string,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
};

export default ProviderButton;
