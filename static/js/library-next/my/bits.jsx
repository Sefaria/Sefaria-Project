/** Small shared pieces for the hub pages. */
import React, { useEffect, useState } from 'react';
import { useT, pick } from '../i18n';
import { Link } from '../router';
import { useContentLang } from '../contentLang';
import { refUrl } from './data';

export const hasHebrew = (s) => /[֐-׿]/.test(s || '');

/** The title to show for a saved item: Hebrew when the content language is Hebrew and one exists. */
export function useItemTitle() {
  const [contentLang] = useContentLang();
  const { lang } = useT();
  return (item) => {
    const he = item.heTitle || item.heRef;
    const en = item.title || item.ref;
    return (contentLang === 'he' || (contentLang === 'bi' && lang === 'he')) && he ? he : en;
  };
}

/** A link into the reader for a ref, titled for the content language. */
export function RefLink({ item, className = '', children }) {
  const title = useItemTitle()(item);
  return (
    <Link to={refUrl(item.ref)} className={`ln-my-ref ${hasHebrew(title) ? 'ln-text-he-ui' : ''} ${className}`} title={item.ref}>
      {children || title}
    </Link>
  );
}

/** Hebrew / English text for the current content language (both when `bi`). */
export function BiText({ he, en, compact = false }) {
  const [contentLang] = useContentLang();
  const showHe = contentLang !== 'en' && he;
  const showEn = contentLang !== 'he' && en;
  if (!showHe && !showEn) { return null; }
  return (
    <div className={`ln-my-bitext ${compact ? 'compact' : ''}`}>
      {showHe && <p className="ln-text-he" lang="he" dir="rtl">{he}</p>}
      {showEn && <p className="ln-text-en" lang="en" dir="ltr">{en}</p>}
    </div>
  );
}

export function Simulated({ children }) {
  const { t } = useT();
  return <span className="ln-badge-simulated" title={t('my.simulated.title')}>{children || t('my.simulated')}</span>;
}

export function Empty({ children, action }) {
  return <div className="ln-my-empty"><p>{children}</p>{action}</div>;
}

/** A two-step destructive button: first click arms it, second confirms; disarms after a few seconds. */
export function ConfirmButton({ onConfirm, children, confirmLabel, className = 'ln-btn ln-btn-quiet', disabled }) {
  const { t } = useT();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) { return undefined; }
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? 'is-armed' : ''}`} disabled={disabled}
            onClick={() => { if (armed) { setArmed(false); onConfirm(); } else { setArmed(true); } }}>
      {armed ? (confirmLabel || t('my.confirm')) : children}
    </button>
  );
}

/** A labelled on/off switch. */
export function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="ln-my-switch">
      <input type="checkbox" role="switch" checked={checked} aria-checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="ln-my-switch-track" aria-hidden="true"><span className="ln-my-switch-knob" /></span>
      <span className="ln-my-switch-text"><span>{label}</span>{hint && <span className="ln-small ln-muted">{hint}</span>}</span>
    </label>
  );
}

/** Re-render when any collection changes (for numbers derived outside `useCollection`). */
export function useStoreTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener('libnext:store', bump);
    return () => window.removeEventListener('libnext:store', bump);
  }, []);
  return tick;
}

/** "3 hours ago", "yesterday", or the date, in the interface language. */
export function timeAgo(ts, lang, now = Date.now()) {
  const diff = Math.max(0, now - (ts || 0));
  const minutes = Math.round(diff / 60000);
  const hours = Math.round(diff / 3600000);
  const days = Math.round(diff / 86400000);
  if (minutes < 2) { return lang === 'he' ? 'הרגע' : 'just now'; }
  if (minutes < 60) { return lang === 'he' ? `לפני ${minutes} דקות` : `${minutes} min ago`; }
  if (hours < 24) { return lang === 'he' ? (hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`) : (hours === 1 ? '1 hour ago' : `${hours} hours ago`); }
  if (days < 2) { return lang === 'he' ? 'אתמול' : 'yesterday'; }
  if (days < 14) { return lang === 'he' ? `לפני ${days} ימים` : `${days} days ago`; }
  return formatDate(ts, lang);
}

export function formatDate(ts, lang, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
  try { return new Date(ts).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', options); } catch (e) { return new Date(ts).toISOString().slice(0, 10); }
}

/** Copy text to the clipboard; resolves false when the API is unavailable. */
export async function copyText(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through */ }
  return false;
}

export { pick };
