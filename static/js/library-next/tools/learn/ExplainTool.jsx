/**
 * Explain this (newcomer): what kind of text the selection is, what the book is (description,
 * authors, era and place from /api/v2/index, the category's blurb from the TOC), the glossary
 * terms it contains, and an "Ask the Assistant" hand-off with the ref and text prefilled.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Sefaria from '../../../sefaria/sefaria';
import { useT, pick } from '../../i18n';
import { Link } from '../../router';
import { requestAssistant } from '../../assistant/events';
import { plainText } from '../../reader/textData';
import { textKind, bookDescription, eraCode, authorsOf } from './textKind';
import { detectTerms } from './glossary';

const tidy = s => (s || '').replace(/^\s*\(|\)\s*$/g, '').trim();

function categoryBlurb(categories, lang) {
  try {
    const node = Sefaria.tocObjectByCategories(categories || []);
    if (!node) { return ''; }
    return (lang === 'he' ? (node.heShortDesc || node.heDesc || node.enShortDesc) : (node.enShortDesc || node.enDesc)) || '';
  } catch (e) { return ''; }
}

export function useIndexDetails(title) {
  const [details, setDetails] = useState(() => (title && Sefaria.getIndexDetailsFromCache(title)) || null);
  useEffect(() => {
    let live = true;
    if (!title) { return undefined; }
    Promise.resolve(Sefaria.getIndexDetails(title)).then(d => { if (live && d && !d.error) { setDetails(d); } }).catch(() => {});
    return () => { live = false; };
  }, [title]);
  return details;
}

export function explainPrompt(t, selection, max = 320) {
  const text = plainText(selection.en || '') || plainText(selection.he || '');
  return t('learn.explain.prompt', { ref: selection.ref, text: text.length > max ? `${text.slice(0, max).trim()}…` : text });
}

export default function ExplainTool({ selection, book }) {
  const { t, lang } = useT();
  const details = useIndexDetails(book.title);
  const kind = textKind(book);
  const terms = useMemo(() => detectTerms({ en: selection.en, he: selection.he }), [selection.en, selection.he]);
  const desc = bookDescription(details);
  const era = eraCode(details);
  const authors = authorsOf(details);
  const date = details && details.compDateString ? tidy(pick(details.compDateString)) : '';
  const place = details && details.compPlaceString ? pick(details.compPlaceString) : '';
  const cats = (lang === 'he' && details && details.heCategories) || book.categories || [];
  const blurb = categoryBlurb(book.categories, lang);
  const title = lang === 'he' ? book.heTitle : book.title;
  return (
    <div className="ln-tool-body ln-stack ln-learn">
      <section className="ln-learn-block">
        <h3 className="ln-learn-h">{t('learn.explain.kind')}</h3>
        <p className="ln-learn-kind" data-kind={kind}>{t(`learn.explain.kind.${kind}`)}</p>
        <p className="ln-small ln-muted">{cats.join(' › ')}{blurb && <> · {blurb}</>}</p>
      </section>
      <section className="ln-learn-block">
        <h3 className="ln-learn-h">{t('learn.explain.book', { book: title })}</h3>
        {details ? (
          <>
            {(lang === 'he' ? desc.he : desc.en) && <p className="ln-learn-desc">{lang === 'he' ? desc.he : desc.en}</p>}
            <p className="ln-small ln-muted ln-learn-meta">
              {authors.length > 0 && <span>{t('learn.explain.by', { authors: authors.map(a => (lang === 'he' ? a.he : a.en)).join(', ') })}</span>}
              {date && <span>{t('learn.explain.composed', { date })}{place && ` ${t('learn.explain.place', { place })}`}</span>}
              {era && <span>{t(`learn.explain.era.${era}`)}</span>}
            </p>
          </>
        ) : <span className="ln-skeleton-line short" />}
        <Link to={`/${(book.title || '').replace(/ /g, '_')}`} className="ln-small">{t('reader.explainer.more')}</Link>
      </section>
      <section className="ln-learn-block">
        <h3 className="ln-learn-h">{t('learn.explain.glossary')}</h3>
        {terms.length ? (
          <dl className="ln-learn-dl">
            {terms.map(({ term }) => (
              <div key={term.id} className="ln-learn-term">
                <dt><span className="ln-text-en">{term.en}</span> <span className="ln-text-he ln-muted" lang="he">{term.he}</span></dt>
                <dd>{lang === 'he' ? term.def.he : term.def.en}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="ln-small ln-muted">{t('learn.explain.noTerms')}</p>}
      </section>
      <div className="ln-row">
        <button type="button" className="ln-btn ln-btn-primary" onClick={() => requestAssistant(explainPrompt(t, selection))}>{t('learn.ask')}</button>
      </div>
    </div>
  );
}
