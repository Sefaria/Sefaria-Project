/**
 * The associated-texts panel for one segment (A3 · N2 · I1 in the NG UX catalog).
 *
 * First screen: the segment, then a short list with no heading: the reader's pinned works
 * first (whatever their category, each unpinnable there), then the corpus's major commentators
 * (its top 5); then its works by category, then "Cited by" (later works quoting it), collapsed
 * until asked for, and the reader's own notes. From there: category -> work -> its comments,
 * and a citation inside a comment opens the cited text on top. Each step is a history entry
 * (overlayState.js), so Back walks the trail; the breadcrumb jumps along it.
 *
 * Open: a work's comments on the segment, one comment, or a cited text can be made the
 * reader's primary text, front and center (reader.openText): the panel closes and the reader
 * shows that text, with a history entry so Back returns to where the reader was.
 *
 * Books only: no sheets, no topics. Counts load first; comment text follows one commentator
 * at a time (associatedData.js). A work can be pinned to show under every segment.
 *
 * Server-rendered for `with=` pages: the shell renders from props, the data arrives in effects.
 */
import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useNgReader} from '../context';
import {HOME} from '../overlayState';
import {
  CITED_BY, bookOpenTarget, categoryLabel, corpusOf, displayTitle, groupLinks, isHebrewOnly, resolveFilter, shortList,
} from '../associated';
import {
  loadLinks, loadPrivateNotes, peekBookComments, peekRefText, paragraphs, queueBookComments, queueRefText,
} from '../associatedData';
import {associatedStrings} from '../associatedStrings';
import {MAX_PINS, isPinned, pinScope} from '../pins';
import {bindDashes, visibleTexts} from '../text';
import {OpenIcon} from '../TextStream';

const useClientLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const Icon = ({children, className = 'ng-icon'}) => (
  <svg className={className} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"
       fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const BackIcon = () => <Icon className="ng-icon ng-icon-flip"><path d="M14.5 5.5 8 12l6.5 6.5" /></Icon>;
const CloseIcon = () => <Icon><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Icon>;
const Chevron = () => <Icon className="ng-row-chevron ng-icon-flip"><path d="m9.5 6 6 6-6 6" /></Icon>;
const PinIcon = ({filled}) => (
  <Icon className="ng-icon ng-pin-icon">
    <path d="M9 3.8h6l-1 5.4 3.2 3.3v1.3H6.8v-1.3L10 9.2z" fill={filled ? 'currentColor' : 'none'} />
    <path d="M12 13.8v6.4" />
  </Icon>
);

/** Which texts to show for a comment in the panel's language, and whether it lacks English. */
export function commentLanguages(comment, language) {
  const hasHe = comment.he.length > 0;
  const hasEn = comment.en.length > 0;
  if (language === 'hebrew') { return {he: hasHe || !hasEn, en: !hasHe && hasEn, hebrewOnly: false}; }
  if (language === 'english') { return {he: !hasEn && hasHe, en: hasEn, hebrewOnly: !hasEn && hasHe}; }
  return {he: hasHe, en: hasEn, hebrewOnly: false};
}

function Html({html, className, lang, dir}) {
  return <div className={className} lang={lang} dir={dir} dangerouslySetInnerHTML={{__html: html}} />;
}

function Paragraphs({comment, language, s}) {
  const show = commentLanguages(comment, language);
  return (
    <>
      {show.he ? comment.he.map((html, i) => <Html key={`he${i}`} className="ng-assoc-he" lang="he" dir="rtl" html={html} />) : null}
      {show.en ? comment.en.map((html, i) => <Html key={`en${i}`} className="ng-assoc-en" lang="en" dir="ltr" html={html} />) : null}
      {show.hebrewOnly ? <span className="ng-hebrew-only" data-ng="hebrew-only">{s.hebrewOnly}</span> : null}
    </>
  );
}

function Loading({s, rows = 3}) {
  return (
    <div className="ng-assoc-loading" role="status" aria-live="polite">
      {Array.from({length: rows}, (_, i) => <span key={i} className="ng-skeleton" style={{width: `${92 - i * 17}%`}} />)}
      <span className="ng-visually-hidden">{s.loading}</span>
    </div>
  );
}

function Failed({s, onRetry}) {
  return <button type="button" className="ng-assoc-retry" data-ng="panel-retry" onClick={onRetry}>{s.loadFailed}</button>;
}

function LanguageToggle({language, onChange, s}) {
  const options = [['hebrew', 'א', s.showSource], ['english', 'A', s.showTranslation], ['bilingual', 'אA', s.showBoth]];
  return (
    <div className="ng-assoc-lang" role="group" aria-label={s.textLanguage}>
      {options.map(([value, glyph, label]) => (
        <button key={value} type="button" className="ng-assoc-lang-option" data-ng={`panel-lang-${value}`}
                aria-pressed={language === value} aria-label={label} title={label} onClick={() => onChange(value)}>
          <span aria-hidden="true" lang={value === 'english' ? 'en' : 'he'}>{glyph}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ data hooks

function useLinks(ref) {
  const [state, setState] = useState({ref, status: 'loading', links: []});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ref) { return undefined; }
    let alive = true;
    setState(prev => (prev.ref === ref && prev.status === 'ready' ? prev : {ref, status: 'loading', links: []}));
    loadLinks(ref).then(
      links => { if (alive) { setState({ref, status: 'ready', links}); } },
      () => { if (alive) { setState({ref, status: 'error', links: []}); } },
    );
    return () => { alive = false; };
  }, [ref, attempt]);
  return {...(state.ref === ref ? state : {ref, status: 'loading', links: []}), retry: () => setAttempt(a => a + 1)};
}

/** Re-render when queued text arrives. */
function useQueued(load, peek, key, active = true) {
  const [, bump] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active || !key) { return undefined; }
    let alive = true;
    setFailed(false);
    if (peek() === undefined) {
      load().then(() => { if (alive) { bump(n => n + 1); } }, () => { if (alive) { setFailed(true); } });
    }
    return () => { alive = false; };
  }, [key, active]); // eslint-disable-line react-hooks/exhaustive-deps
  return {value: key ? peek() : undefined, failed, retry: () => { setFailed(false); load().then(() => bump(n => n + 1), () => setFailed(true)); }};
}

function useNotes(ref, uid) {
  const [notes, setNotes] = useState([]);
  useEffect(() => {
    if (!ref || !uid) { setNotes([]); return undefined; }
    let alive = true;
    loadPrivateNotes(ref, uid).then(list => { if (alive) { setNotes(list); } });
    return () => { alive = false; };
  }, [ref, uid]);
  return notes;
}

// ------------------------------------------------------------------ rows

function previewHtml(comments, language, interfaceLang) {
  const first = comments && comments.find(c => c.he.length || c.en.length);
  if (!first) { return null; }
  // Bilingual readers preview in the interface's language (the full comment shows both).
  const show = commentLanguages(first, language === 'bilingual' ? (interfaceLang === 'hebrew' ? 'hebrew' : 'english') : language);
  return {html: show.en ? first.en[0] : first.he[0], lang: show.en ? 'en' : 'he', dir: show.en ? 'ltr' : 'rtl'};
}

function BookRow({book, s, interfaceLang, language, onOpen, preview, pinned}) {
  const hebrewUI = interfaceLang === 'hebrew';
  const hebrewOnly = isHebrewOnly(book, language);
  return (
    <li>
      <button type="button" className="ng-row" data-ng="book-row" data-key={book.key} onClick={() => onOpen(book)}>
        <span className="ng-row-main">
          <span className="ng-row-title" lang={hebrewUI ? 'he' : 'en'}>{displayTitle(book, interfaceLang)}</span>
          {preview ? <span className="ng-row-preview" lang={preview.lang} dir={preview.dir} dangerouslySetInnerHTML={{__html: preview.html}} /> : null}
        </span>
        <span className="ng-row-meta">
          {pinned ? <span className="ng-row-pinned" title={s.pinned}><PinIcon filled /></span> : null}
          {hebrewOnly ? <span className="ng-hebrew-only" data-ng="hebrew-only">{s.hebrewOnly}</span> : null}
          <span className="ng-row-count">{book.count}</span>
        </span>
        <Chevron />
      </button>
    </li>
  );
}

/**
 * A row of the first list. A pinned work carries its pin, which unpins it here; a pinned work
 * with nothing on this segment is still listed (muted), so it can always be found and unpinned.
 */
function ShortListRow({entry, s, interfaceLang, language, onOpen, onUnpin}) {
  const {book, pin} = entry;
  const title = displayTitle(book || pin, interfaceLang);
  const unpin = entry.pinned ? (
    <button type="button" className="ng-row-unpin" data-ng="unpin" data-key={entry.key} aria-pressed="true"
            aria-label={s.unpin(title)} title={s.unpin(title)} onClick={() => onUnpin(book || pin)}>
      <PinIcon filled />
    </button>
  ) : null;
  if (!book) {
    return (
      <li className="ng-row-wrap" data-pinned="true">
        <div className="ng-row ng-row-absent" data-ng="book-row" data-key={entry.key} data-absent="true">
          <span className="ng-row-main">
            <span className="ng-row-title" lang={interfaceLang === 'hebrew' ? 'he' : 'en'}>{title}</span>
            <span className="ng-row-note">{s.notHere}</span>
          </span>
        </div>
        {unpin}
      </li>
    );
  }
  const hebrewOnly = isHebrewOnly(book, language);
  const preview = previewHtml(peekBookComments(book), language, interfaceLang);
  return (
    <li className="ng-row-wrap" data-pinned={entry.pinned ? 'true' : undefined}>
      <button type="button" className="ng-row" data-ng="book-row" data-key={book.key} onClick={() => onOpen(book)}>
        <span className="ng-row-main">
          <span className="ng-row-title" lang={interfaceLang === 'hebrew' ? 'he' : 'en'}>{title}</span>
          {preview ? <span className="ng-row-preview" lang={preview.lang} dir={preview.dir} dangerouslySetInnerHTML={{__html: preview.html}} /> : null}
        </span>
        <span className="ng-row-meta">
          {hebrewOnly ? <span className="ng-hebrew-only" data-ng="hebrew-only">{s.hebrewOnly}</span> : null}
          <span className="ng-row-count">{book.count}</span>
        </span>
        {entry.pinned ? null : <Chevron />}
      </button>
      {unpin}
    </li>
  );
}

function CategoryRow({group, s, interfaceLang, onOpen}) {
  return (
    <li>
      <button type="button" className="ng-row ng-row-category" data-ng="category-row" data-category={group.category}
              onClick={() => onOpen(group.category)}>
        <span className="ng-cat-mark" data-category={group.category} aria-hidden="true" />
        <span className="ng-row-main">
          <span className="ng-row-title">{categoryLabel(group.category, interfaceLang, s.citedBy)}</span>
        </span>
        <span className="ng-row-meta">
          <span className="ng-row-count">{s.works(group.books.length)}</span>
        </span>
        <Chevron />
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ views

function Anchor({segment, language, interfaceLang}) {
  if (!segment) { return null; }
  const vis = visibleTexts(segment, language === 'bilingual' ? (interfaceLang === 'hebrew' ? 'hebrew' : 'english') : language);
  const useHe = vis.he && !vis.en;
  const html = useHe ? segment.he : bindDashes(segment.en);
  return (
    <div className="ng-assoc-anchor" data-ng="panel-anchor">
      <Html className={useHe ? 'ng-assoc-anchor-text ng-assoc-he' : 'ng-assoc-anchor-text ng-assoc-en'}
            lang={useHe ? 'he' : 'en'} dir={useHe ? 'rtl' : 'ltr'} html={html} />
    </div>
  );
}

function HomeView({grouped, links, notes, s, interfaceLang, language, openBook, openCategory, citedOpen, setCitedOpen, pinList, onUnpin}) {
  if (links.status === 'error') { return <Failed s={s} onRetry={links.retry} />; }
  if (!grouped) { return <Loading s={s} rows={4} />; }
  const empty = !grouped.total && !notes.length;
  // The short list has no heading: the reader's pins first, then the corpus's major commentators.
  const top = shortList(grouped, pinList);
  return (
    <>
      {empty ? <p className="ng-assoc-empty">{s.noConnections}</p> : null}
      {top.length ? (
        <section className="ng-assoc-group ng-assoc-top" data-ng="top-commentators">
          <ul className="ng-rows">
            {top.map(entry => (
              <ShortListRow key={entry.key} entry={entry} s={s} interfaceLang={interfaceLang} language={language}
                            onOpen={openBook} onUnpin={onUnpin} />
            ))}
          </ul>
        </section>
      ) : null}
      {grouped.categories.length ? (
        <section className="ng-assoc-group" data-ng="categories">
          <h3 className="ng-assoc-label">{top.length ? s.byCategory : s.panelLabel}</h3>
          <ul className="ng-rows">
            {grouped.categories.map(group => (
              <CategoryRow key={group.category} group={group} s={s} interfaceLang={interfaceLang} onOpen={openCategory} />
            ))}
          </ul>
        </section>
      ) : null}
      {grouped.citedBy ? (
        <section className="ng-assoc-group ng-citedby" data-ng="cited-by" data-open={citedOpen ? 'true' : 'false'}>
          <button type="button" className="ng-row ng-disclosure" data-ng="cited-by-toggle" aria-expanded={citedOpen}
                  onClick={() => setCitedOpen(!citedOpen)}>
            <span className="ng-cat-mark" data-category={CITED_BY} aria-hidden="true" />
            <span className="ng-row-main">
              <span className="ng-row-title">{s.citedBy}</span>
              <span className="ng-row-note">{s.citedByNote}</span>
            </span>
            <span className="ng-row-meta"><span className="ng-row-count">{s.works(grouped.citedBy.books.length)}</span></span>
            <Icon className="ng-row-chevron ng-disclosure-chevron"><path d="m6 9.5 6 6 6-6" /></Icon>
          </button>
          {citedOpen ? (
            <ul className="ng-rows ng-rows-nested" data-ng="cited-by-list">
              {grouped.citedBy.books.map(book => (
                <BookRow key={book.key} book={book} s={s} interfaceLang={interfaceLang} language={language} onOpen={openBook} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {notes.length ? (
        <section className="ng-assoc-group" data-ng="notes">
          <h3 className="ng-assoc-label">{s.yourNotes}</h3>
          {notes.map((note, i) => (
            <article key={note._id || i} className="ng-note" data-ng="note">
              {note.title ? <h4 className="ng-note-title">{note.title}</h4> : null}
              {note.text ? <div className="ng-note-text" dangerouslySetInnerHTML={{__html: note.text}} /> : null}
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}

function CategoryView({group, s, interfaceLang, language, openBook, isBookPinned}) {
  if (!group) { return null; }
  const leading = group.books.slice(0, group.leading);
  const rest = group.books.slice(group.leading);
  return (
    <>
      {leading.length ? (
        <ul className="ng-rows" data-ng="category-leading">
          {leading.map(book => (
            <BookRow key={book.key} book={book} s={s} interfaceLang={interfaceLang} language={language} onOpen={openBook}
                     preview={previewHtml(peekBookComments(book), language, interfaceLang)} pinned={isBookPinned(book)} />
          ))}
        </ul>
      ) : null}
      <ul className={leading.length ? 'ng-rows ng-rows-rest' : 'ng-rows'} data-ng="category-books">
        {rest.map(book => (
          <BookRow key={book.key} book={book} s={s} interfaceLang={interfaceLang} language={language} onOpen={openBook}
                   pinned={isBookPinned(book)} />
        ))}
      </ul>
    </>
  );
}

/** "Open": make a text the reader's primary text (front and center). */
function OpenButton({target, s, dataNg, label = null, className = 'ng-assoc-open', onOpen}) {
  if (!target) { return null; }
  return (
    <button type="button" className={className} data-ng={dataNg} data-open-ref={target}
            aria-label={s.openRef(label || target)} title={s.openRef(label || target)} onClick={() => onOpen(target)}>
      <OpenIcon />
      <span>{s.open}</span>
    </button>
  );
}

function BookControls({book, s, pinned, full, onToggle, onOpenText}) {
  const canPin = book.category !== CITED_BY;
  return (
    <div className="ng-pin-control">
      <div className="ng-book-actions">
        {canPin ? (
          <button type="button" className="ng-pin-button" data-ng="pin-toggle" aria-pressed={pinned} disabled={!pinned && full}
                  onClick={onToggle}>
            <PinIcon filled={pinned} />
            <span>{pinned ? s.pinned : s.pin}</span>
          </button>
        ) : null}
        <OpenButton target={bookOpenTarget(book)} s={s} dataNg="book-open" className="ng-pin-button ng-open-button" onOpen={onOpenText} />
      </div>
      {canPin && !pinned && full ? <p className="ng-pin-hint" data-ng="pin-full">{s.pinFull}</p> : null}
    </div>
  );
}

function BookView({book, s, language, interfaceLang, pinned, pinFull, onTogglePin, onCitation, onOpenText}) {
  const comments = useQueued(() => queueBookComments(book, {front: true}), () => peekBookComments(book), book && book.key, !!book);
  if (!book) { return null; }
  return (
    <>
      <BookControls book={book} s={s} pinned={pinned} full={pinFull} onToggle={onTogglePin} onOpenText={onOpenText} />
      {comments.failed ? <Failed s={s} onRetry={comments.retry} /> : null}
      {!comments.failed && comments.value === undefined ? <Loading s={s} /> : null}
      {comments.value ? (
        <div className="ng-comments" onClick={onCitation}>
          {comments.value.map(comment => {
            const label = interfaceLang === 'hebrew' ? (comment.heRef || comment.ref) : comment.ref;
            return (
              <article key={comment.ref} className="ng-comment" data-ng="comment" data-ref={comment.ref}>
                <Paragraphs comment={comment} language={language} s={s} />
                <button type="button" className="ng-comment-open" data-ng="comment-open" data-open-ref={comment.ref}
                        aria-label={s.openRef(label)} title={s.openRef(label)} onClick={() => onOpenText(comment.ref)}>
                  <span className="ng-comment-ref" dir="auto">{label}</span>
                  <OpenIcon />
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function RefView({refName, s, language, onCitation, onOpenInReader}) {
  const text = useQueued(() => queueRefText(refName), () => peekRefText(refName), refName);
  const comment = text.value ? {ref: refName, he: paragraphs(text.value.he), en: paragraphs(text.value.en)} : null;
  return (
    <>
      {text.failed ? <Failed s={s} onRetry={text.retry} /> : null}
      {!text.failed && text.value === undefined ? <Loading s={s} /> : null}
      {comment ? (
        <div className="ng-comments" onClick={onCitation}>
          <article className="ng-comment ng-tangent" data-ng="tangent" data-ref={refName}>
            <Paragraphs comment={comment} language={language} s={s} />
          </article>
        </div>
      ) : null}
      <OpenButton target={refName} s={s} dataNg="open-in-reader" className="ng-pin-button ng-open-button ng-open-tangent" onOpen={onOpenInReader} />
    </>
  );
}

// ------------------------------------------------------------------ the panel

function viewTitle(view, {segmentLabel, grouped, interfaceLang, s, refLabels}) {
  if (view.kind === 'home') { return segmentLabel; }
  if (view.kind === 'category') { return categoryLabel(view.category, interfaceLang, s.citedBy); }
  if (view.kind === 'book') {
    const book = grouped && grouped.books.find(b => b.key === view.key);
    return book ? displayTitle(book, interfaceLang) : String(view.key).split('|').slice(1).join('|');
  }
  if (view.kind === 'ref') { return (interfaceLang === 'hebrew' && refLabels[view.ref]) || view.ref; }
  return segmentLabel;
}

export default function AssociatedPanel({overlay, onClose}) {
  const reader = useNgReader();
  const {interfaceLang, settings, sections, currentSection, uid, pins = {}, togglePin} = reader;
  const s = associatedStrings(interfaceLang);
  const hebrewUI = interfaceLang === 'hebrew';
  const ref = overlay.ref;
  const stack = overlay.stack && overlay.stack.length ? overlay.stack : [HOME];
  const view = stack[stack.length - 1];

  const section = (sections || []).find(sec => sec.segments.some(sg => sg.ref === ref)) || currentSection || null;
  const segment = section ? section.segments.find(sg => sg.ref === ref) : null;
  const corpus = corpusOf(section);
  const scope = pinScope(section, corpus);

  // The panel's language follows the reader's, and can be changed here for the panel alone.
  const [language, setLanguage] = useState(settings.language);
  useEffect(() => { setLanguage(settings.language); }, [settings.language]);

  const links = useLinks(ref);
  const grouped = useMemo(() => (links.status === 'ready' ? groupLinks(links.links, {corpus, interfaceLang}) : null),
    [links.status, links.links, corpus, interfaceLang]);
  const notes = useNotes(ref, uid);
  const [citedOpen, setCitedOpen] = useState(false);
  useEffect(() => { setCitedOpen(false); }, [ref]);

  // Previews for the first list (pins, then the major commentators), one work at a time, after the counts.
  const [, bump] = useState(0);
  const pinList = pins[scope] || [];
  const pinsKey = pinList.map(p => `${p.category}|${p.title}`).join('+');
  useEffect(() => {
    if (!grouped) { return undefined; }
    let alive = true;
    shortList(grouped, pinList).forEach(({book}) => {
      if (book && peekBookComments(book) === undefined) {
        queueBookComments(book).then(() => { if (alive) { bump(n => n + 1); } }, () => {});
      }
    });
    return () => { alive = false; };
  }, [grouped, pinsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A `with=` filter becomes its work or category once the links are known.
  useEffect(() => {
    if (view.kind !== 'filter' || !grouped) { return; }
    const resolved = resolveFilter(grouped, view.name);
    if (resolved) { reader.overlayReplaceView(resolved); } else { reader.overlayBack(); }
  }, [view, grouped]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep each level's scroll position: back to the list lands where the reader left it.
  const rootRef = useRef(null);
  const scrolls = useRef({});
  const scroller = () => (rootRef.current && rootRef.current.closest ? rootRef.current.closest('[data-ng="sheet"]') : null);
  const depth = stack.length;
  const lastDepth = useRef(depth);
  useClientLayoutEffect(() => {
    const el = scroller();
    if (!el) { return; }
    if (depth !== lastDepth.current) {
      el.scrollTop = depth < lastDepth.current ? (scrolls.current[depth] || 0) : 0;
      lastDepth.current = depth;
    }
  }, [depth]);
  const remember = () => { const el = scroller(); if (el) { scrolls.current[depth] = el.scrollTop; } };

  const openBook = useCallback((book) => { remember(); reader.overlayPushView({kind: 'book', key: book.key}); }, [reader, depth]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCategory = useCallback((category) => { remember(); reader.overlayPushView({kind: 'category', category}); }, [reader, depth]); // eslint-disable-line react-hooks/exhaustive-deps
  const [refLabels, setRefLabels] = useState({});
  const onCitation = useCallback((e) => {
    const link = e.target.closest && e.target.closest('a');
    if (!link) { return; }
    e.preventDefault();  // no navigation out of the panel: citations open on the stack, entities stay put
    const cited = link.classList.contains('refLink') ? link.getAttribute('data-ref') : null;
    if (cited) {
      remember();
      setRefLabels(prev => ({...prev, [cited]: link.textContent}));
      reader.overlayPushView({kind: 'ref', ref: cited});
    }
  }, [reader, depth]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBookPinned = (book) => isPinned(pins, scope, book);
  const segmentLabel = (hebrewUI ? overlay.heRef : ref) || ref || '';
  const titleFor = (v) => viewTitle(v, {segmentLabel, grouped, interfaceLang, s, refLabels});
  const book = view.kind === 'book' && grouped ? grouped.books.find(b => b.key === view.key) || null : null;
  const group = view.kind === 'category' && grouped
    ? (view.category === CITED_BY ? grouped.citedBy : grouped.categories.find(c => c.category === view.category)) : null;

  let subtitle = null;
  if (view.kind === 'home' && grouped && grouped.total) { subtitle = s.connections(grouped.total); }
  if (view.kind === 'category' && group) { subtitle = s.works(group.books.length); }
  if (view.kind === 'book' && book) { subtitle = s.comments(book.count); }

  // The trail, shortened past four levels: first … last two.
  const crumbs = stack.map((v, i) => ({i, label: titleFor(v)}));
  const trail = crumbs.length > 4 ? [crumbs[0], null, ...crumbs.slice(-2)] : crumbs;

  return (
    <div className="ng-panel ng-assoc" data-ng="panel-associated" data-ref={ref} data-view={view.kind}
         data-language={language} data-depth={depth} ref={rootRef}>
      <header className="ng-assoc-head">
        <div className="ng-assoc-bar">
          {depth > 1 ? (
            <button type="button" className="ng-assoc-icon-button" data-ng="panel-back" onClick={reader.overlayBack}
                    aria-label={s.back} title={s.back}><BackIcon /></button>
          ) : null}
          <div className="ng-assoc-titles">
            <h2 className="ng-assoc-title" data-ng="panel-title">{titleFor(view)}</h2>
            {subtitle ? <div className="ng-assoc-subtitle">{subtitle}</div> : null}
          </div>
          <LanguageToggle language={language} onChange={setLanguage} s={s} />
          <button type="button" className="ng-assoc-icon-button" data-ng="overlay-close" onClick={onClose}
                  aria-label={s.close} title={s.close}><CloseIcon /></button>
        </div>
        {depth > 1 ? (
          <nav className="ng-crumbs" data-ng="crumbs" aria-label={s.trail}>
            {trail.map((c, n) => (c ? (
              c.i === depth - 1
                ? <span key={c.i} className="ng-crumb ng-crumb-current" aria-current="page">{c.label}</span>
                : <button key={c.i} type="button" className="ng-crumb" data-ng="crumb" data-index={c.i}
                          onClick={() => reader.overlayJump(c.i)}>{c.label}</button>
            ) : <span key={`gap${n}`} className="ng-crumb-gap" aria-hidden="true">…</span>))}
          </nav>
        ) : null}
      </header>
      <div className="ng-assoc-body" data-ng="panel-body">
        {view.kind === 'home' ? <Anchor segment={segment} language={language} interfaceLang={interfaceLang} /> : null}
        {view.kind === 'home' ? (
          <HomeView grouped={grouped} links={links} notes={notes} s={s} interfaceLang={interfaceLang} language={language}
                    openBook={openBook} openCategory={openCategory} citedOpen={citedOpen} setCitedOpen={setCitedOpen}
                    pinList={pinList} onUnpin={(book) => togglePin(scope, book)} />
        ) : null}
        {view.kind === 'category' ? (
          group ? <CategoryView group={group} s={s} interfaceLang={interfaceLang} language={language} openBook={openBook}
                                isBookPinned={isBookPinned} />
            : (links.status === 'error' ? <Failed s={s} onRetry={links.retry} /> : <Loading s={s} />)
        ) : null}
        {view.kind === 'book' ? (
          book ? <BookView book={book} s={s} language={language} interfaceLang={interfaceLang} pinned={isBookPinned(book)}
                           pinFull={(pins[scope] || []).length >= MAX_PINS} onTogglePin={() => togglePin(scope, book)}
                           onCitation={onCitation} onOpenText={reader.openText} />
            : (links.status === 'error' ? <Failed s={s} onRetry={links.retry} /> : <Loading s={s} />)
        ) : null}
        {view.kind === 'ref' ? (
          <RefView refName={view.ref} s={s} language={language} onCitation={onCitation} onOpenInReader={reader.openRefFromOverlay} />
        ) : null}
        {view.kind === 'filter' ? <Loading s={s} /> : null}
      </div>
    </div>
  );
}
