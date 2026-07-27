import React from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';

const SSO_PROVIDER_INFO = {
  google: { msgEn: 'auth.email_registered_google', linkEn: 'auth.continue_with_google_link' },
  apple:  { msgEn: 'auth.email_registered_apple',  linkEn: 'auth.continue_with_apple_link'  },
};

const GenericErrorItem = ({ message, linkText, onClick }) => (
  <span>
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

GenericErrorItem.propTypes = {
  message: PropTypes.string.isRequired,
  linkText: PropTypes.string,
  onClick: PropTypes.func,
};

// Apple can be triggered with a normal onClick. Google's real button lives in a cross-origin
// iframe elsewhere in the page (see useProviderTriggers) — this link is purely a positioning
// target (`registerGoogleTarget`, a ref callback) for that invisible, tracked overlay; it has
// no click handler of its own, since the actual click never reaches it.
const ProviderErrorItem = ({ provider, registerGoogleTarget, triggerApple }) => {
  const key = provider.toLowerCase();
  const displayName = key.charAt(0).toUpperCase() + key.slice(1);
  const info = SSO_PROVIDER_INFO[key] || { msgEn: `This email is registered via ${displayName}.`, linkEn: `Continue with ${displayName}` };

  return (
    <span>
      <InterfaceText>{info.msgEn}</InterfaceText>
      {' '}
      {key === 'apple' ? (
        <a href="#" className="sefaria-auth-provider-action" onClick={(e) => { e.preventDefault(); triggerApple?.(); }}>
          <InterfaceText>{info.linkEn}</InterfaceText>
        </a>
      ) : (
        <span ref={registerGoogleTarget} className="sefaria-auth-provider-action">
          <InterfaceText>{info.linkEn}</InterfaceText>
        </span>
      )}
    </span>
  );
};

ProviderErrorItem.propTypes = {
  provider: PropTypes.string.isRequired,
  registerGoogleTarget: PropTypes.func,
  triggerApple: PropTypes.func,
};

const ErrorBanner = ({
  error, registerGoogleTarget, triggerApple, onLinkClick,
}) => {
  if (!error) return null;

  return (
    <div className="sefaria-auth-error" role="alert">
      <img className="sefaria-auth-error-icon" src="/static/icons/info-error.svg" alt="" aria-hidden="true" />
      <div className="sefaria-auth-error-content">
        {error.code === 'sso_only_account' ? (
          error.providers.map((provider) => (
            <ProviderErrorItem
              key={provider} provider={provider}
              registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple}
            />
          ))
        ) : (
          <GenericErrorItem message={error.message} linkText={error.linkText} onClick={onLinkClick} />
        )}
      </div>
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
  registerGoogleTarget: PropTypes.func,
  triggerApple: PropTypes.func,
  onLinkClick: PropTypes.func,
};

export default ErrorBanner;
