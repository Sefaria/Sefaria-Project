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
  const metadata = data && data._auth;
  const message = pickFirstError(data) || fallback;
  return {
    message: Sefaria._(message),
    code: metadata && metadata.code,
    providers: metadata && Array.isArray(metadata.providers) ? metadata.providers : [],
  };
}
