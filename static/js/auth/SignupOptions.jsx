import React, { useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import Sefaria from '../sefaria/sefaria';
import ProviderButton from './ProviderButton.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import { useProviderTriggers, useProviderError } from './useSsoSignIn.jsx';
import { useAuthTracking } from './useAuthTracking.js';

/**
 * SignupOptions — round Google / Apple / Email sign-up buttons for outside AuthPage, e.g. the
 * Library Assistant's login prompt (ReaderApp puts them in <lc-chatbot>'s `signup-options` slot).
 *
 * Google and Apple sign up right here, reported like the sign-up card (flow 'register') with
 * `source`, and a failure shows here too. The flow starts on a click (lazy), since the options
 * are on the page whether or not anyone means to sign up. Email hands over to `onEmailClick`,
 * which opens AuthPage's email form; AuthPage reports that sign-up itself.
 */
const SignupOptions = ({ source, next, onEmailClick, featureName }) => {
  const { googleClientId, appleClientId } = Sefaria;
  const tracking = useAuthTracking({ flow: 'register', source, lazy: true });
  // A click on Google's button happens inside Google's cross-origin iframe, so the page never
  // sees it; pass it on as a click on the Google circle, like the other options' clicks (for the
  // host's click analytics).
  const googleCircleElRef = useRef(null);
  const onGoogleClick = () => {
    googleCircleElRef.current?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };
  const {
    googleReady, appleReady, overlayNode, registerGoogleTarget, setActiveErrorHandler, triggerApple,
  } = useProviderTriggers({ next, tracking, onGoogleClick });
  const [error] = useProviderError(setActiveErrorHandler);

  // Google's button is created at the size of the circle it covers, so the circle is handed over
  // only once it's in view: before that the options may be on the page without being laid out
  // (the assistant shows its slot only in the login prompt).
  const observerRef = useRef(null);
  const googleCircleRef = useCallback((el) => {
    googleCircleElRef.current = el;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    observerRef.current = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observerRef.current.disconnect();
      registerGoogleTarget(el);
    });
    observerRef.current.observe(el);
  }, [registerGoogleTarget]);

  return (
    <div className="sefaria-signup-options">
      <ErrorBanner error={error} registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple} />
      <div className="sefaria-signup-options-buttons">
        {googleClientId && (
          <ProviderButton
            variant="icon" provider="google" featureName={featureName}
            disabled={!googleReady} trackingRef={googleCircleRef}
          />
        )}
        {appleClientId && (
          <ProviderButton
            variant="icon" provider="apple" featureName={featureName}
            disabled={!appleReady} onClick={triggerApple}
          />
        )}
        <ProviderButton variant="icon" provider="email" featureName={featureName} onClick={onEmailClick} />
      </div>
      {overlayNode}
    </div>
  );
};

SignupOptions.propTypes = {
  source: PropTypes.string.isRequired,
  next: PropTypes.string.isRequired,
  onEmailClick: PropTypes.func.isRequired,
  // For the host's click analytics, on every option (`data-feature-name`).
  featureName: PropTypes.string,
};

export default SignupOptions;
