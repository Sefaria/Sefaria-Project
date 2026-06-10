import React from 'react';
import ReactDOM from 'react-dom';
import AuthPage from './AuthPage.jsx';

/**
 * Entry point for the standalone `login` webpack bundle (spec 1602).
 * Mounts <AuthPage> into #sefaria-auth-root, reading server-bootstrapped props
 * from the element's data-props attribute (client IDs, next, CSRF, initial flow).
 * React / ReactDOM are provided globally by base.html (webpack externals).
 */
function mount() {
  const el = document.getElementById('sefaria-auth-root');
  if (!el) return;
  const d = el.dataset;
  const props = {
    initialFlow: d.initialFlow || 'login',
    googleClientId: d.googleClientId || '',
    appleClientId: d.appleClientId || '',
    recaptchaSiteKey: d.recaptchaSiteKey || '',
    ssoRedirectState: d.ssoRedirectState || '',
    next: d.next || '/',
    csrfToken: d.csrf || '',
    dir: d.dir || 'ltr',
  };
  ReactDOM.render(<AuthPage {...props} />, el);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
