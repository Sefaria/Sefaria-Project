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

export function buildResetUrl(uid) {
  return `/password/reset/confirm/${uid}/set-password/`;
}

export function checkPasswordsMatch(p1, p2) {
  return (p2 && p1 !== p2) ? 'auth.passwords_dont_match' : null;
}

async function postRequest(url, csrf, body, contentType) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'X-CSRFToken': csrf },
      body,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data, networkError: false };
  } catch (err) {
    return { ok: false, data: {}, networkError: true };
  }
}

// Every auth view POSTs, parses JSON (tolerating a non-JSON body), and needs
// the same "network failed" fallback — centralized here so views only branch
// on the (ok, data) they get back, not on how the request itself can fail.
export function postJson(url, body, csrf) {
  return postRequest(url, csrf, JSON.stringify(body), 'application/json');
}

export function postForm(url, body, csrf) {
  return postRequest(url, csrf, body.toString(), 'application/x-www-form-urlencoded');
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
