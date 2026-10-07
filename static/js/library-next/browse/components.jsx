/** Small shared pieces for the browse pages. */
import React from 'react';
import { useT, pick } from '../i18n';
import { useContentLang } from '../contentLang';
import { Link } from '../router';

/** `{ t, lang, dir, contentLang }` in one call. */
export function useLangs() {
  const { t, lang, dir } = useT();
  const [contentLang] = useContentLang();
  return { t, lang, dir, contentLang };
}

/**
 * A title in the content language: Hebrew, English or both (interface language first). Missing
 * values fall back to the other language so nothing renders empty.
 */
export function BiTitle({ en, he, contentLang, lang, className = '', as: Tag = 'span' }) {
  const enText = en || he || '';
  const heText = he || en || '';
  if (contentLang === 'he' || (contentLang === 'bi' && heText === enText)) {
    return <Tag className={`ln-bi ${className}`} lang="he" dir="rtl">{heText}</Tag>;
  }
  if (contentLang === 'en' || !he) {
    return <Tag className={`ln-bi ${className}`} lang="en" dir="ltr">{enText}</Tag>;
  }
  const first = lang === 'he' ? ['he', heText] : ['en', enText];
  const second = lang === 'he' ? ['en', enText] : ['he', heText];
  return (
    <Tag className={`ln-bi ln-bi-both ${className}`}>
      <span lang={first[0]} dir={first[0] === 'he' ? 'rtl' : 'ltr'}>{first[1]}</span>
      <span className="ln-bi-sep" aria-hidden="true"> · </span>
      <span lang={second[0]} dir={second[0] === 'he' ? 'rtl' : 'ltr'} className="ln-bi-second">{second[1]}</span>
    </Tag>
  );
}

/** A home/page module: heading, optional subtitle, optional action link, body. */
export function Section({ id, title, sub, action, children, className = '' }) {
  return (
    <section className={`ln-module ${className}`} data-module={id} aria-labelledby={id ? `ln-module-${id}` : undefined}>
      <header className="ln-module-head">
        <div>
          <h2 className="ln-section-title" id={id ? `ln-module-${id}` : undefined}>{title}</h2>
          {sub && <p className="ln-module-sub ln-muted">{sub}</p>}
        </div>
        {action && <div className="ln-module-action">{action}</div>}
      </header>
      {children}
    </section>
  );
}

export function Simulated({ children }) {
  const { t } = useT();
  return <span className="ln-badge-simulated">{children || t('cal.simulated')}</span>;
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="ln-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <span key={i} className={`ln-skeleton-line ${i === lines - 1 ? 'short' : ''}`} />)}
    </div>
  );
}

export function Empty({ children }) {
  return <p className="ln-empty ln-muted">{children}</p>;
}

/** Description text from `{ en, he }` in the interface language. */
export function Desc({ text, className = '' }) {
  const value = pick(text);
  return value ? <p className={`ln-desc ${className}`}>{value}</p> : null;
}

export function ArrowLink({ to, children, className = '' }) {
  return <Link to={to} className={`ln-arrow-link ${className}`}>{children} <span aria-hidden="true" className="ln-arrow">→</span></Link>;
}
