/**
 * Connections for the selection: counts first (grouped by category, then work, major
 * commentators first), "Cited by" (Quoting Commentary) behind a disclosure, a work's refs, and a
 * connection's text inline with "Open in reader". Loads links only when opened.
 * Registered as the built-in `connections` tool; `hint.with` (from `?with=`) preselects a work.
 */
import React, { useEffect, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { useT } from '../i18n';
import { navigate } from '../router';
import { useContentLang } from '../contentLang';
import { groupConnections } from './textData';
import { refToPath } from './refKind';

const SUMMARY_BOOKS = 6;

function catColor(cat) {
  return Sefaria.palette.categoryColor(cat);
}

function catName(cat, lang) {
  return lang === 'he' && Sefaria.hebrewTerm ? (Sefaria.hebrewTerm(cat) || cat) : cat;
}

export function findBook(grouped, needle) {
  if (!grouped || !needle) { return null; }
  const n = needle.toLowerCase();
  const all = grouped.categories.concat(grouped.citedBy ? [grouped.citedBy] : []).flatMap(c => c.books);
  return all.find(b => b.title.toLowerCase() === n || b.indexTitle.toLowerCase() === n || b.heTitle === needle)
    || all.find(b => b.indexTitle.toLowerCase().startsWith(n)) || null;
}

const flatHtml = v => (Array.isArray(v) ? v.flat(Infinity).filter(Boolean).join(' ') : (v || ''));

function BookList({ books, lang, t, onPick, limit }) {
  const [all, setAll] = useState(false);
  const shown = all || !limit ? books : books.slice(0, limit);
  return (
    <>
      <ul className="ln-conn-books">
        {shown.map(b => (
          <li key={b.title}>
            <button type="button" className="ln-conn-book" onClick={() => onPick(b)}>
              <span className="ln-conn-book-title">{lang === 'he' ? b.heTitle : b.title}</span>
              {!b.hasEnglish && <span className="ln-badge-simulated ln-conn-heonly">{t('connections.hebrewOnly')}</span>}
              <span className="ln-conn-count">{b.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {limit && !all && books.length > limit && (
        <button type="button" className="ln-btn ln-btn-quiet ln-conn-more" onClick={() => setAll(true)}>
          {t('connections.books', { n: books.length })}
        </button>
      )}
    </>
  );
}

function Category({ cat, lang, t, onPick, limit }) {
  return (
    <section className="ln-conn-cat" style={{ '--cat': catColor(cat.category) }}>
      <h3 className="ln-conn-cat-title ln-cat-rule">
        <span>{catName(cat.category, lang)}</span>
        <span className="ln-conn-count">{cat.count}</span>
      </h3>
      <BookList books={cat.books} lang={lang} t={t} onPick={onPick} limit={limit} />
    </section>
  );
}

export default function ConnectionsPanel({ selection, close, hint }) {
  const { t, lang } = useT();
  const [contentLang] = useContentLang();
  const [state, setState] = useState({ status: 'loading', grouped: null });
  const [view, setView] = useState({ book: null, link: null });
  const [citedOpen, setCitedOpen] = useState(false);
  const [text, setText] = useState(null);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading', grouped: null });
    setView({ book: null, link: null });
    Promise.resolve(Sefaria.getLinks(selection.ref))
      .then(links => {
        if (!live) { return; }
        const grouped = groupConnections(Array.isArray(links) ? links : []);
        setState({ status: 'ready', grouped });
        const preset = hint && hint.with ? findBook(grouped, hint.with) : null;
        if (preset) { setView({ book: preset, link: null }); if (grouped.citedBy && grouped.citedBy.books.includes(preset)) { setCitedOpen(true); } }
      })
      .catch(() => { if (live) { setState({ status: 'error', grouped: null }); } });
    return () => { live = false; };
  }, [selection.ref]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!view.link) { setText(null); return undefined; }
    let live = true;
    setText({ status: 'loading' });
    Promise.resolve(Sefaria.getText(view.link.sourceRef, { context: 0 }))
      .then(d => { if (live) { setText(d && !d.error ? { status: 'ready', data: d } : { status: 'error' }); } })
      .catch(() => { if (live) { setText({ status: 'error' }); } });
    return () => { live = false; };
  }, [view.link]);

  if (state.status === 'loading') {
    return <div className="ln-conn" aria-busy="true"><p className="ln-muted">{t('connections.loading')}</p><span className="ln-skeleton-line" /><span className="ln-skeleton-line short" /></div>;
  }
  if (state.status === 'error') {
    return <div className="ln-conn"><p className="ln-muted">{t('connections.error')}</p></div>;
  }
  const { grouped } = state;

  if (view.link) {
    const link = view.link;
    const hasEn = !!link.sourceHasEn;
    const showHe = contentLang !== 'en' || !hasEn;
    const showEn = contentLang !== 'he' && hasEn;
    return (
      <div className="ln-conn ln-conn-text">
        <button type="button" className="ln-btn ln-btn-quiet ln-conn-back" onClick={() => setView({ ...view, link: null })}>‹ {t('connections.back')}</button>
        <h3 className="ln-conn-ref">{lang === 'he' ? link.sourceHeRef : link.sourceRef}</h3>
        {!hasEn && <span className="ln-badge-simulated ln-conn-heonly">{t('connections.hebrewOnly')}</span>}
        {(!text || text.status === 'loading') && <p className="ln-muted">{t('connections.loadingText')}</p>}
        {text && text.status === 'error' && <p className="ln-muted">{t('connections.textError')}</p>}
        {text && text.status === 'ready' && (
          <div className="ln-conn-body">
            {showHe && <div className="ln-text-he" lang="he" dangerouslySetInnerHTML={{ __html: flatHtml(text.data.he) }} />}
            {showEn && <div className="ln-text-en" lang="en" dangerouslySetInnerHTML={{ __html: flatHtml(text.data.text) }} />}
          </div>
        )}
        <button type="button" className="ln-btn ln-btn-primary ln-conn-open" onClick={() => { close(); navigate(refToPath(link.sourceRef)); }}>
          {t('connections.openInReader')}
        </button>
      </div>
    );
  }

  if (view.book) {
    const book = view.book;
    return (
      <div className="ln-conn ln-conn-book-view" style={{ '--cat': catColor(book.category) }}>
        <button type="button" className="ln-btn ln-btn-quiet ln-conn-back" onClick={() => setView({ book: null, link: null })}>‹ {t('connections.back')}</button>
        <h3 className="ln-conn-ref ln-cat-rule">
          {lang === 'he' ? book.heTitle : book.title} <span className="ln-conn-count">{book.count}</span>
          {!book.hasEnglish && <span className="ln-badge-simulated ln-conn-heonly">{t('connections.hebrewOnly')}</span>}
        </h3>
        <ul className="ln-conn-links">
          {book.links.map(link => (
            <li key={link._id || link.sourceRef}>
              <button type="button" className="ln-conn-link" onClick={() => setView({ book, link })}>
                <span>{lang === 'he' ? link.sourceHeRef : link.sourceRef}</span>
                {book.hasEnglish && !link.sourceHasEn && <span className="ln-badge-simulated ln-conn-heonly">{t('connections.hebrewOnly')}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const pick = b => setView({ book: b, link: null });
  return (
    <div className="ln-conn">
      <p className="ln-conn-total">{grouped.total === 1 ? t('connections.totalOne') : t('connections.total', { n: grouped.total })}</p>
      {grouped.total === 0 && <p className="ln-muted">{t('connections.none')}</p>}
      {grouped.categories.map(cat => <Category key={cat.category} cat={cat} lang={lang} t={t} onPick={pick} limit={SUMMARY_BOOKS} />)}
      {grouped.citedBy && (
        citedOpen ? (
          <section className="ln-conn-cat ln-conn-cited" style={{ '--cat': catColor('Quoting Commentary') }}>
            <h3 className="ln-conn-cat-title ln-cat-rule">
              <span>{t('connections.citedBy')}</span>
              <span className="ln-conn-count">{grouped.citedBy.count}</span>
            </h3>
            <BookList books={grouped.citedBy.books} lang={lang} t={t} onPick={pick} limit={SUMMARY_BOOKS} />
            <button type="button" className="ln-btn ln-btn-quiet ln-conn-more" onClick={() => setCitedOpen(false)}>{t('connections.hideCitedBy')}</button>
          </section>
        ) : (
          <button type="button" className="ln-btn ln-conn-citedby" aria-expanded="false" onClick={() => setCitedOpen(true)}>
            {t('connections.showCitedBy', { n: grouped.citedBy.count })}
          </button>
        )
      )}
    </div>
  );
}
