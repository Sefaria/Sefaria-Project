export const ALLAUTH_PROVIDER_TOKEN_URL = '/_allauth/browser/v1/auth/provider/token';

export function makeFlowId() {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function whenReady(check, cb) {
  let tries = 80;
  let cancelled = false;
  let timer = null;
  const tick = () => {
    if (cancelled) return;
    if (check()) { cb(); return; }
    if (--tries <= 0) return;
    timer = setTimeout(tick, 100);
  };
  tick();
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}

export function pickFirstError(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.errors?.[0]?.message === 'string')
    return data.errors[0].message;
  for (const k of Object.keys(data)) {
    if (k === '_auth' || k === 'errors') continue;
    if (typeof data[k] === 'string') return data[k];
  }
  return null;
}

export function safeNext(next) {
  return /^\/(?!\/)/.test(next) ? next : '/';
}

export function focusProvider(provider) {
  const target = provider.toLowerCase() === 'google' ? 'google-signin-button' : 'apple-signin-button';
  window.setTimeout(() => {
    const element = document.getElementById(target);
    if (element) {
      element.scrollIntoView({ block: 'center' });
      element.focus();
    }
  }, 0);
}

export function authError(data, fallback) {
  const metadata = data?._auth;
  const message = pickFirstError(data) || fallback;
  return {
    message: Sefaria._(message),
    code: metadata?.code,
    providers: Array.isArray(metadata?.providers) ? metadata.providers : [],
  };
}
