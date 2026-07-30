import { useEffect } from 'react';
import { ALLAUTH_PROVIDER_TOKEN_URL, makeUuid } from './utils';
import { fireFlowStarted, fireMethodChosen, fireProcessStarted, fireProcessEnded, fireFlowEnded, SIGNUP_METHOD } from './signupAnalytics';
import { getCsrfToken } from '../sefaria/csrf';

const AUTH_PATHS = new Set(['/login', '/register']);
const SESSION_KEY = 'sefaria_interruptive_ui_shown';

const wasShown = () => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return true; } };
const markShown = () => { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { } };
const hasInterruptiveUI = () =>
  ['.cookiesNotification', '.siteWideBanner:not(.hidden)', '.modal', '[role="dialog"][aria-modal="true"]']
    .some(s => !!document.querySelector(s));

export default function GoogleOneTap({ googleClientId }) {
  useEffect(() => {
    if (!googleClientId) return;
    if (AUTH_PATHS.has(window.location.pathname.replace(/\/$/, ''))) return;
    if (wasShown()) return;

    // isDisplayed() is Google's own choice to show the widget, not a user action — the real
    // analog of "clicked the button" is this callback actually firing, since One Tap only ever
    // offers accounts already signed into the browser: clicking one needs no fresh login, so
    // Google hands us a credential essentially unconditionally, before anything about *our*
    // backend's success/failure is known. There's no earlier "user is interacting" signal the
    // API exposes, so the funnel burst fires here instead of on display — and if the user never
    // clicks at all (dismissed, timed out, tapped outside, or never shown), nothing fires at all,
    // since no attempt genuinely began.
    const handleCredential = (response, flowId, attemptId) => {
      fireFlowStarted(flowId, 'one_tap');
      fireMethodChosen(flowId, attemptId, SIGNUP_METHOD.GOOGLE_ONE_TAP);
      fireProcessStarted(flowId, attemptId);
      fetch(ALLAUTH_PROVIDER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ provider: 'google', process: 'login',
                               token: { client_id: googleClientId, id_token: response.credential } }),
      })
        .then(r => { if (r.ok) return null; return r.json(); })
        .then(data => {
          const status = data ? 'failure' : 'success';
          const error = data ? (data.error || 'unknown') : null;
          fireProcessEnded(flowId, attemptId, status, error);
          fireFlowEnded(flowId, status, error);
          if (data) console.error('Google One Tap failed', data);
          else window.location.reload();
        })
        .catch(err => {
          fireProcessEnded(flowId, attemptId, 'failure', 'network_error');
          fireFlowEnded(flowId, 'failure', 'network_error');
          console.error('Google One Tap error', err);
        });
    };

    let timeoutId;
    const initOneTap = () => {
      timeoutId = setTimeout(() => {
        if (hasInterruptiveUI()) { markShown(); return; }
        const flowId = makeUuid();
        const attemptId = makeUuid();
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (resp) => handleCredential(resp, flowId, attemptId),
        });
        window.google.accounts.id.prompt();
        markShown();
      }, 1200);
    };

    if (window.google?.accounts) {
      initOneTap();
      return () => clearTimeout(timeoutId);
    } else {
      window.addEventListener('google-identity-loaded', initOneTap, { once: true });
      return () => {
        window.removeEventListener('google-identity-loaded', initOneTap);
        clearTimeout(timeoutId);
      };
    }
  }, [googleClientId]);

  return null;
}
