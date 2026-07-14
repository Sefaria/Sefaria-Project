import { useEffect } from 'react';
import { getCsrf, ALLAUTH_PROVIDER_TOKEN_URL } from '../auth/utils';

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

    const handleCredential = (response) => {
      fetch(ALLAUTH_PROVIDER_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
        body: JSON.stringify({ provider: 'google', process: 'login',
                               token: { client_id: googleClientId, id_token: response.credential } }),
      })
        .then(r => { if (r.ok) window.location.reload(); else return r.json(); })
        .then(data => { if (data) console.error('Google One Tap failed', data); })
        .catch(err => console.error('Google One Tap error', err));
    };

    const initOneTap = () => {
      setTimeout(() => {
        if (hasInterruptiveUI()) { markShown(); return; }
        window.google.accounts.id.initialize({ client_id: googleClientId, callback: handleCredential });
        window.google.accounts.id.prompt();
        markShown();
      }, 1200);
    };

    if (window.google?.accounts) {
      initOneTap();
    } else {
      window.addEventListener('google-identity-loaded', initOneTap, { once: true });
      return () => window.removeEventListener('google-identity-loaded', initOneTap);
    }
  }, [googleClientId]);

  return null;
}
