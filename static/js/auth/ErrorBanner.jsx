import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';

const SSO_PROVIDER_INFO = {
  google: { msgEn: 'auth.email_registered_google', linkEn: 'auth.continue_with_google_link' },
  apple:  { msgEn: 'auth.email_registered_apple',  linkEn: 'auth.continue_with_apple_link'  },
};

const renderItem = (key, message, linkText, onClick) => (
  <span key={key}>
    <InterfaceText>{message}</InterfaceText>
    {linkText && (
      <>
        {' '}
        <a href="#" onClick={(e) => { e.preventDefault(); onClick?.(); }}>
          <InterfaceText>{linkText}</InterfaceText>
        </a>
      </>
    )}
  </span>
);

const ErrorBanner = ({ error, onProviderClick, onLinkClick }) => {
  if (!error) return null;

  const items = error.code === 'sso_only_account'
    ? error.providers.map((provider) => {
        const key = provider.toLowerCase();
        const info = SSO_PROVIDER_INFO[key] || { msgEn: `This email is registered via ${provider}.`, linkEn: `Continue with ${provider}` };
        return renderItem(provider, info.msgEn, info.linkEn, () => onProviderClick?.(provider));
      })
    : renderItem('error', error.message, error.linkText, onLinkClick);

  return (
    <div className="sefaria-auth-error" role="alert">
      <img className="sefaria-auth-error-icon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
      <div className="sefaria-auth-error-content">{items}</div>
    </div>
  );
};

ErrorBanner.propTypes = {
  error: PropTypes.shape({
    message: PropTypes.string.isRequired,
    code: PropTypes.string,
    providers: PropTypes.arrayOf(PropTypes.string),
    linkText: PropTypes.string,
  }),
  onProviderClick: PropTypes.func,
  onLinkClick: PropTypes.func,
};

export default ErrorBanner;
