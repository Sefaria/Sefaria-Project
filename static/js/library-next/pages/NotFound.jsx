import React from 'react';
import { useT } from '../i18n';
import { Link } from '../router';

export default function NotFound({ pathname }) {
  const { t } = useT();
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  return (
    <section className="ln-container ln-placeholder">
      <h1 className="ln-page-title">{t('notfound.title')}</h1>
      <p className="ln-placeholder-body">{t('notfound.body', { path })}</p>
      <Link className="ln-btn" to="/texts">{t('nav.texts')}</Link>
    </section>
  );
}
