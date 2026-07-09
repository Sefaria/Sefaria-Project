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

export function getCsrf(explicit) {
  if (explicit) return explicit;
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? m[1] : '';
}

export function pickFirstError(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.error === 'string') return data.error;
  for (const k of Object.keys(data)) {
    if (k === '_auth') continue;
    if (typeof data[k] === 'string') return data[k];
  }
  return null;
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
