import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { makeFlowId, focusProvider } from './utils.js';
import { getCsrfToken } from '../sefaria/csrf';

/**
 * AuthPage — the React login / register / reset experience (spec 1602).
 *
 * A single state machine that swaps the card content in place (no page navigation):
 *   view ∈ { choose, email, forgot, forgot-sent, reset, reset-expired, reset-success }
 *   and flow ∈ { login, register, reset }.
 * The card's own back button returns to `choose`; the browser URL stays /login, /register,
 * or the reset-confirm URL (for `flow === 'reset'`, handled by ReaderApp).
 *
 * SSO uses the existing backend callbacks (/api/auth/{google,apple}/callback). Email
 * login/register use JSON+session endpoints (/api/auth/login, /register).
 */
const AuthPage = ({
  flow = 'login',
  next = '/',
  resetValid = null,
  onFlowChange,
}) => {
  const [view, setView] = useState(() => {
    if (flow !== 'reset') return 'choose';
    return resetValid === false ? 'reset-expired' : 'reset';
  });
  const [fields, setFields] = useState({ email: '', password: '', first: '', last: '' });
  const csrf = getCsrfToken();
  const fieldsRef = useRef(fields);
  const registrationAnalytics = useRef({
    flowId: makeFlowId(),
    started: false,
    ended: false,
    status: 'failure',
  });
  fieldsRef.current = fields;

  const setField = (k) => (e) => {
    const value = e.target.value; // capture before the async setState updater (React event pooling)
    setFields((f) => ({ ...f, [k]: value }));
  };
  const switchFlow = (f) => (e) => {
    e?.preventDefault();
    setView('choose');
    onFlowChange?.(f);
  };

  const trackRegistration = useCallback((name, extra = {}) => {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
    const filledFields = [
      ['email', fieldsRef.current.email],
      ['first_name', fieldsRef.current.first],
      ['last_name', fieldsRef.current.last],
      ['password1', fieldsRef.current.password],
    ].filter(([, value]) => value).map(([field]) => field);
    const from = new URLSearchParams(window.location.search).get('from') || undefined;
    window.gtag('event', name, {
      project: 'site_registration',
      feature_name: 'site_registration_form',
      flow_id: registrationAnalytics.current.flowId,
      from,
      text: filledFields.length ? filledFields.join('|') : null,
      transport_type: 'beacon',
      ...extra,
    });
  }, []);

  const startRegistration = useCallback(() => {
    if (registrationAnalytics.current.started) return;
    registrationAnalytics.current.started = true;
    trackRegistration('form_start');
  }, [trackRegistration]);

  const endRegistration = useCallback((status=null) => {
    const analytics = registrationAnalytics.current;
    if (!analytics.started || analytics.ended) return;
    analytics.ended = true;
    if (status) analytics.status = status;
    trackRegistration('form_end', { status: analytics.status });
  }, [trackRegistration]);

  useEffect(() => {
    window.addEventListener('beforeunload', endRegistration);
    window.addEventListener('popstate', endRegistration);
    return () => {
      window.removeEventListener('beforeunload', endRegistration);
      window.removeEventListener('popstate', endRegistration);
    };
  }, [endRegistration]);

  useEffect(() => {
    const active = flow === 'register' && view === 'email';
    if (active) {
      registrationAnalytics.current = {
        flowId: makeFlowId(),
        started: false,
        ended: false,
        status: 'failure',
      };
      return;
    }
    endRegistration();
  }, [flow, view, endRegistration]);

  // ---- views --------------------------------------------------------------
  const onForgotClick = (e) => { e.preventDefault(); setView('forgot'); };
  const onProviderClick = (p) => { setView('choose'); focusProvider(p); };
  // The rare "link doesn't resolve to any account" fallback routes to the
  // existing manual-email-entry ForgotView rather than building a new one.
  const requestNewLink = () => { setView('forgot'); onFlowChange?.('login'); };

  let content;
  if (view === 'email' && flow === 'register') {
    content = (
      <RegisterView
        switchFlow={switchFlow} fields={fields} setField={setField}
        onBack={() => setView('choose')} onProviderClick={onProviderClick}
        startRegistration={startRegistration}
        trackRegistration={trackRegistration} endRegistration={endRegistration}
        next={next} csrf={csrf}
      />
    );
  } else if (view === 'email') {
    content = (
      <LoginView
        switchFlow={switchFlow} fields={fields} setField={setField}
        onBack={() => setView('choose')} onProviderClick={onProviderClick}
        onForgotClick={onForgotClick} next={next} csrf={csrf}
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
        next={next} onEmailClick={() => setView('email')}
      />
    );
  }

  return <div className="sefaria-auth-page">{content}</div>;
};

AuthPage.propTypes = {
  flow: PropTypes.oneOf(['login', 'register', 'reset']),
  next: PropTypes.string,
  resetValid: PropTypes.bool,
  onFlowChange: PropTypes.func,
};

export default AuthPage;
