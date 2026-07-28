import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { InterfaceText } from '../Misc.jsx';
import ChooseView from './ChooseView.jsx';
import LoginView from './LoginView.jsx';
import RegisterView from './RegisterView.jsx';
import ForgotView from './ForgotView.jsx';
import ResetView from './ResetView.jsx';
import ResetExpiredView from './ResetExpiredView.jsx';
import MessageView from './MessageView.jsx';
import Button from '../common/Button.jsx';
import { pathToFlow, flowToPath, nextFromPath } from './utils.js';
import { useProviderTriggers } from './useSsoSignIn.jsx';
import { useSignUpTracking } from './useSignUpTracking.js';
import { SIGNUP_METHOD } from './signupAnalytics.js';
import { getCsrfToken } from '../sefaria/csrf';

/**
 * AuthPage — the React login / register / reset experience (spec 1602).
 *
 * A single state machine that swaps the card content in place (no page navigation):
 *   view ∈ { choose, email, forgot, forgot-sent, reset, reset-expired, reset-success }
 *   and flow ∈ { login, register, reset }, derived from `initialPath` (ReaderApp only
 *   knows this is an auth route, not what flow it represents).
 * The card's own back button returns to `choose`; the browser URL stays /login, /register,
 * or the reset-confirm URL (for `flow === 'reset'`, pushed by ReaderApp via `onNavigate`).
 *
 * SSO uses the existing backend callbacks (/api/auth/{google,apple}/callback). Email
 * login/register use JSON+session endpoints (/api/auth/login, /register).
 */
const AuthPage = ({
  initialPath = '/login',
  authSource = null,
  resetValid = null,
  onNavigate,
}) => {
  const flow = pathToFlow(initialPath);
  const next = nextFromPath(initialPath);
  const [view, setView] = useState(() => {
    if (flow !== 'reset') return 'choose';
    return resetValid === false ? 'reset-expired' : 'reset';
  });
  const prevFlowRef = useRef(flow);
  // Clicking "Log in"/"Sign up" outside this component (e.g. in the header) only updates the
  // `initialPath` prop/URL, bypassing `switchFlow` below — without this, the card stays stuck on
  // whatever view it was showing (reset, forgot, email, ...) instead of landing on ChooseView.
  // `view` is never set to 'reset'/'reset-expired' here: that view is only ever reached via a
  // direct reset-confirm link, handled once by the initializer above.
  useEffect(() => {
    if (prevFlowRef.current === flow) return;
    prevFlowRef.current = flow;
    setView('choose');
  }, [flow]);
  const [fields, setFields] = useState({ email: '', password: '', first: '', last: '' });
  const csrf = getCsrfToken();
  const tracking = useSignUpTracking({ flow, source: authSource });
  const {
    googleReady, appleReady, overlayNode, registerGoogleTarget, setActiveErrorHandler, triggerApple,
  } = useProviderTriggers({ next, tracking });
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const setField = (k) => (e) => {
    const value = e.target.value; // capture before the async setState updater (React event pooling)
    setFields((f) => ({ ...f, [k]: value }));
  };
  const switchFlow = (f) => (e) => {
    e?.preventDefault();
    const source = e?.currentTarget?.getAttribute?.('data-signup-source') || undefined;
    setView('choose');
    onNavigate?.(flowToPath(f, next), source);
  };

  // ---- views --------------------------------------------------------------
  const onForgotClick = (e) => { e.preventDefault(); setView('forgot'); };
  // The rare "link doesn't resolve to any account" fallback routes to the
  // existing manual-email-entry ForgotView rather than building a new one.
  const requestNewLink = () => { setView('forgot'); onNavigate?.(flowToPath('login', next)); };
  const onEmailClick = () => {
    tracking.chooseMethod(SIGNUP_METHOD.EMAIL);
    tracking.startProcess();
    setView('email');
  };

  let content;
  if (view === 'email' && flow === 'register') {
    content = (
      <RegisterView
        switchFlow={switchFlow} fields={fields} setField={setField}
        onBack={() => setView('choose')}
        endProcess={tracking.endProcess}
        next={next} csrf={csrf}
        registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple}
        setActiveErrorHandler={setActiveErrorHandler}
      />
    );
  } else if (view === 'email') {
    content = (
      <LoginView
        switchFlow={switchFlow} fields={fields} setField={setField}
        onBack={() => setView('choose')}
        onForgotClick={onForgotClick} next={next} csrf={csrf}
        registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple}
        setActiveErrorHandler={setActiveErrorHandler}
      />
    );
  } else if (view === 'forgot') {
    content = (
      <ForgotView
        emailValue={fields.email} setField={setField} csrf={csrf}
        onSuccess={() => setView('forgot-sent')} onBack={() => setView('email')}
      />
    );
  } else if (view === 'forgot-sent') {
    content = <MessageView heading="auth.reset_link_sent" sub="auth.check_your_email" />;
  } else if (view === 'reset') {
    content = (
      <ResetView csrf={csrf} onLinkExpired={() => setView('reset-expired')} onSuccess={() => setView('reset-success')} />
    );
  } else if (view === 'reset-expired') {
    content = (
      <ResetExpiredView csrf={csrf} onResendSuccess={() => setView('forgot-sent')} onRequestNewLink={requestNewLink} />
    );
  } else if (view === 'reset-success') {
    content = (
      <MessageView heading="auth.password_reset_success_title" sub="auth.password_reset_success_sub">
        <div className="sefaria-auth-stack">
          <Button variant="sefaria-common-button auth-primary" size="fullwidth" onClick={switchFlow('login')}>
            <InterfaceText>auth.log_in_link</InterfaceText>
          </Button>
        </div>
      </MessageView>
    );
  } else {
    content = (
      <ChooseView
        flow={flow} switchFlow={switchFlow}
        onEmailClick={onEmailClick}
        googleReady={googleReady} appleReady={appleReady}
        registerGoogleTarget={registerGoogleTarget} triggerApple={triggerApple}
        setActiveErrorHandler={setActiveErrorHandler}
      />
    );
  }

  return (
    <div className="sefaria-auth-page">
      {content}
      {overlayNode}
    </div>
  );
};

AuthPage.propTypes = {
  initialPath: PropTypes.string,
  authSource: PropTypes.string,
  resetValid: PropTypes.bool,
  onNavigate: PropTypes.func,
};

export default AuthPage;
