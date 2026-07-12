import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import ChooseView from './ChooseView.jsx';
import EmailView from './EmailView.jsx';
import ForgotView from './ForgotView.jsx';
import ForgotSentView from './ForgotSentView.jsx';
import { getCsrf, makeFlowId, focusProvider } from './utils.js';

/**
 * AuthPage — the React login / register / reset experience (spec 1602).
 *
 * A single state machine that swaps the card content in place (no page navigation):
 *   view ∈ { choose, email, forgot } and flow ∈ { login, register }.
 * The card's own back button returns to `choose`; the browser URL stays /login or /register.
 *
 * SSO uses the existing backend callbacks (/api/auth/{google,apple}/callback). Email
 * login/register use JSON+session endpoints (/api/auth/login, /api/auth/register).
 */
const AuthPage = ({
  initialFlow = 'login',
  next = '/',
}) => {
  const [flow, setFlow] = useState(initialFlow === 'register' ? 'register' : 'login');
  const [view, setView] = useState('choose'); // choose | email | forgot
  const [fields, setFields] = useState({ email: '', password: '', first: '', last: '' });
  const csrf = getCsrf();
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
    setFlow(f);
    setView('choose');
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

  let content;
  if (view === 'email') {
    content = (
      <EmailView
        flow={flow} switchFlow={switchFlow} fields={fields} setField={setField}
        onBack={() => setView('choose')}
        onProviderClick={(p) => { setView('choose'); focusProvider(p); }}
        startRegistration={startRegistration}
        trackRegistration={trackRegistration} endRegistration={endRegistration}
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
    content = <ForgotSentView onSignIn={switchFlow('login')} />;
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
  initialFlow: PropTypes.oneOf(['login', 'register']),
  next: PropTypes.string,
};

export default AuthPage;
