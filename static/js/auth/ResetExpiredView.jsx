import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import AuthCard from './AuthCard.jsx';
import Button from '../common/Button.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { authError, postJson } from './utils.js';

/**
 * Shown whenever the reset-confirm link is (or turns out to be) invalid —
 * expired, already used, or malformed — either from the initial page load
 * or discovered mid-session when ResetView's submit fails. One click asks for
 * a new link to the account's existing email (no email field): it posts to this
 * page's own address, and the server checks that the link's token (from the
 * address, or from the session on the set-password address) was real and only
 * too old. The server mails a new link only in that case (and at most a few
 * times an hour) and answers the same either way, so the next card must not
 * promise an email.
 */
const ResetExpiredView = ({ csrf, onResendSuccess, onRequestNewLink }) => {
  const [noAccountForLink, setNoAccountForLink] = useState(false);
  const [error, setError] = useState(null);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setError(null);
    setResending(true);
    const { ok, data } = await postJson(window.location.pathname, { action: 'resend' }, csrf);
    if (ok) {
      onResendSuccess();
    } else if (data?._auth?.code === 'no_account_for_link') {
      setNoAccountForLink(true);
    } else {
      setError(authError(data, 'auth.generic_error'));
    }
    setResending(false);
  };

  return (
    <AuthCard heading={<InterfaceText>auth.reset_link_expired_title</InterfaceText>}>
      {noAccountForLink ? (
        <ErrorBanner
          error={{ message: 'auth.reset_link_no_account_sub', linkText: 'auth.request_new_link' }}
          onLinkClick={onRequestNewLink}
        />
      ) : (
        <>
          <ErrorBanner error={error} />
          <div className="sefaria-auth-stack">
            <Button
              variant="sefaria-common-button auth-primary"
              size="fullwidth"
              onClick={handleResend}
              disabled={resending}
            >
              <InterfaceText>auth.request_new_link</InterfaceText>
            </Button>
          </div>
        </>
      )}
    </AuthCard>
  );
};

ResetExpiredView.propTypes = {
  csrf: PropTypes.string.isRequired,
  onResendSuccess: PropTypes.func.isRequired,
  onRequestNewLink: PropTypes.func.isRequired,
};

export default ResetExpiredView;
