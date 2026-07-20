import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';

const SSO_LINK_LABELS = {
  google: 'Continue with Google',
  apple: 'Continue with Apple',
};

const ErrorBanner = ({ error, onProviderClick }) => {
  if (!error) return null;
  return (
    <div className="sefaria-auth-error" role="alert">
      <img className="sefaria-auth-error-icon" src="/static/icons/info.svg" alt="" aria-hidden="true" />
      <div className="sefaria-auth-error-content">
        <InterfaceText>{error.message}</InterfaceText>
        {error.code === 'sso_only_account' && error.providers.map((provider) => {
          const key = provider.toLowerCase();
          const labelEn = SSO_LINK_LABELS[key] || `Continue with ${provider}`;
          return (
            <a
              key={provider}
              href={`#${key === 'google' ? 'google-signin-button' : 'apple-signin-button'}`}
              className="sefaria-auth-provider-action"
              onClick={(event) => { event.preventDefault(); onProviderClick?.(provider); }}
            >
              <InterfaceText>{labelEn}</InterfaceText>
            </a>
          );
        })}
      </div>
    </div>
  );
};

ErrorBanner.propTypes = {
  error: PropTypes.shape({
    message: PropTypes.string.isRequired,
    code: PropTypes.string,
    providers: PropTypes.arrayOf(PropTypes.string),
  }),
  onProviderClick: PropTypes.func,
};

export default ErrorBanner;
