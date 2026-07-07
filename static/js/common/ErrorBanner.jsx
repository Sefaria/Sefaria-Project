import React from 'react';
import PropTypes from 'prop-types';

const ErrorBanner = ({ error, onProviderClick }) => {
  if (!error) return null;
  return (
    <div className="sefaria-auth-error" role="alert">
      <img className="sefaria-auth-error-icon" src="/static/icons/info.svg" alt="" aria-hidden="true" />
      <div className="sefaria-auth-error-content">
        <span>{error.message}</span>
        {error.code === 'sso_only_account' && error.providers.map((provider) => (
          <a
            key={provider}
            href={`#${provider.toLowerCase() === 'google' ? 'google-signin-button' : 'apple-signin-button'}`}
            className="sefaria-auth-provider-action"
            onClick={(event) => { event.preventDefault(); onProviderClick(provider); }}
          >
            {Sefaria._(`Sign in with ${provider.charAt(0).toUpperCase()}${provider.slice(1).toLowerCase()}`)}
          </a>
        ))}
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
