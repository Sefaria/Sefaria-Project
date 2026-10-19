/**
 * Newcomer orientation card at the top of the first section: where you are in the book, the
 * book's short description, era and place (from /api/v2/index), and a link to the book page.
 */
import React, { useEffect, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { useT, pick } from '../i18n';
import { Link } from '../router';
import { useKv } from '../store';
import { positionLabel } from './textData';

const HIDDEN_KEY = 'reader.explainerHidden';

const tidy = s => (s || '').replace(/^\s*\(|\)\s*$/g, '').trim();

export default function WhatAmIReading({ book, data }) {
  const { t, lang } = useT();
  const [hidden, setHidden] = useKv(HIDDEN_KEY, false);
  const [details, setDetails] = useState(() => Sefaria.getIndexDetailsFromCache(book.title) || null);
  useEffect(() => {
    let live = true;
    if (!details) {
      Promise.resolve(Sefaria.getIndexDetails(book.title)).then(d => { if (live && d && !d.error) { setDetails(d); } }).catch(() => {});
    }
    return () => { live = false; };
  }, [book.title]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (hidden) { return null; }

  const title = lang === 'he' ? book.heTitle : book.title;
  const pos = positionLabel(data);
  const position = lang === 'he' ? pos.he : pos.en;
  const total = Array.isArray(data.lengths) && (data.sectionNames || []).length === 2 ? data.lengths[0] : null;
  const orientation = total
    ? t('reader.explainer.orientation', { book: title, position, total })
    : t('reader.explainer.orientationShort', { book: title, position });
  const desc = details ? (lang === 'he' ? (details.heShortDesc || details.heDesc) : (details.enShortDesc || details.enDesc)) : '';
  const cats = details && details.heCategories && lang === 'he' ? details.heCategories : (details ? details.categories : book.categories);
  const date = details && details.compDateString ? tidy(pick(details.compDateString)) : '';
  const place = details && details.compPlaceString ? pick(details.compPlaceString) : '';
  const bookPath = `/${(book.title || '').replace(/ /g, '_')}`;
  return (
    <aside className="ln-explainer ln-card ln-cat-rule" style={{ '--cat': Sefaria.palette.categoryColor(book.primaryCategory) }}
           aria-label={t('reader.explainer.title')}>
      <div className="ln-explainer-head">
        <h2 className="ln-explainer-title">{t('reader.explainer.title')}</h2>
        <button type="button" className="ln-btn ln-btn-quiet ln-explainer-hide" onClick={() => setHidden(true)}>{t('reader.explainer.hide')}</button>
      </div>
      <p className="ln-explainer-orient">{orientation}</p>
      {desc ? <p className="ln-explainer-desc">{desc}</p> : <span className="ln-skeleton-line short" />}
      <p className="ln-explainer-meta ln-muted ln-small">
        {(cats || []).join(' › ')}
        {date && <> · {t('reader.explainer.composed', { date })}{place && ` ${t('reader.explainer.place', { place })}`}</>}
      </p>
      <Link to={bookPath} className="ln-explainer-more">{t('reader.explainer.more')}</Link>
    </aside>
  );
}
