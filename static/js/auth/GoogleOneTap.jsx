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

    const handleCredential = (response, flowId, attemptId, markConcluded) => {
      fetch(ALLAUTH_PROVIDER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ provider: 'google', process: 'login',
                               token: { client_id: googleClientId, id_token: response.credential } }),
      })
        .then(r => { if (r.ok) return null; return r.json(); })
        .then(data => {
          markConcluded();
          const status = data ? 'failure' : 'success';
          const error = data ? (data.error || 'unknown') : null;
          fireProcessEnded(flowId, attemptId, status, error);
          fireFlowEnded(flowId, status, error);
          if (data) console.error('Google One Tap failed', data);
          else window.location.reload();
        })
        .catch(err => {
          markConcluded();
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
        let concluded = false;
        const markConcluded = () => { concluded = true; };
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (resp) => handleCredential(resp, flowId, attemptId, markConcluded),
        });
        // GIS invokes this callback twice for the same prompt (once at display, again at
        // dismissal) — `concluded` guards against double-firing flow_ended if a credential
        // success/failure and a dismissal notification both land.
        window.google.accounts.id.prompt((notification) => {
          if (concluded) return;
          if (notification.isDisplayed?.()) {
            fireFlowStarted(flowId, 'one_tap');
            fireMethodChosen(flowId, attemptId, SIGNUP_METHOD.GOOGLE_ONE_TAP);
            fireProcessStarted(flowId, attemptId);
          } else if (notification.isDismissedMoment?.()) {
            const reason = notification.getDismissedReason?.();
            // isDismissedMoment() is also true when a credential was successfully returned
            // (reason 'credential_returned') — that credential is already being handled by
            // handleCredential's own success/failure path, so firing here too would race a
            // spurious failure event against the real success event for the same login.
            if (reason === 'credential_returned') return;
            concluded = true;
            fireFlowEnded(flowId, 'failure', reason || 'dismissed');
          } else if (notification.isSkippedMoment?.() || notification.isNotDisplayed?.()) {
            concluded = true;
            fireFlowEnded(flowId, 'failure',
              notification.getSkippedReason?.() || notification.getNotDisplayedReason?.() || 'not_displayed');
          }
        });
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
