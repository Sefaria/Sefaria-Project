/**
 * Search within the current book, as a sheet over the text. The input takes focus as the sheet
 * opens; results arrive live as you type (debounced), one row per passage with its ref and a
 * highlighted snippet in Hebrew and/or English, and more load as the list scrolls.
 *
 * Queries go through the data layer exactly as the classic reader's "search in this text"
 * (SidebarSearch.jsx): Sefaria.bookSearchPathFilterAPI gives the book's search path
 * ("Tanakh/Torah/Genesis"), and Sefaria.search.execute_query runs a text query filtered to it.
 * Choosing a result navigates inside the reader to that segment (reader.goToRef, which scrolls
 * it into view and flashes it) and closes the sheet.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import Sefaria from '../../sefaria/sefaria';
import {useNgReader} from '../context';
import {
  DEBOUNCE_MS, emptyResults, hasMore as computeHasMore, isSearchable, mergeHits, normalizeQuery,
  queryArgs, reportedTotal, snippetRuns,
} from '../searchData';
import BottomSheet from './BottomSheet';
import {sheetStrings} from './sheetStrings';

const LOAD_MORE_MARGIN = 480;  // px from the bottom of the list at which the next page starts loading

const SearchIcon = () => (
  <svg className="ng-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"
       fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.25" /><path d="M15.25 15.25 20 20" /></svg>
);

/**
 * The search state machine for one book. Returns {status, rows, more, total, loadMore, retry}
 * where status is idle | loading | ready | error. Stale responses (an older query) are dropped.
 */
export function useBookSearch(book, query) {
  const [state, setState] = useState({status: 'idle', query: '', results: emptyResults(), more: false, total: null, paging: false});
  const token = useRef(0);
  const pathRef = useRef(null);
  const aborter = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback((q, start) => {
    const my = ++token.current;
    const pathPromise = pathRef.current && pathRef.current.book === book
      ? Promise.resolve(pathRef.current.path)
      : Promise.resolve(Sefaria.bookSearchPathFilterAPI(book)).then(path => { pathRef.current = {book, path}; return path; });
    pathPromise.then(path => {
      if (my !== token.current) { return; }
      if (!path || typeof path !== 'string') { throw new Error('no search path'); }
      const args = queryArgs({query: q, path, start});
      args.success = (data) => {
        if (my !== token.current) { return; }
        setState(prev => {
          const base = start ? prev.results : emptyResults();
          const merged = mergeHits(base, data && data.hits ? data.hits.hits : []);
          const total = reportedTotal(data);
          return {
            status: 'ready', query: q, results: merged, total, paging: false,
            more: computeHasMore({added: merged.added, seenCount: merged.seen.size, total}),
          };
        });
      };
      args.error = (err) => {
        if (my !== token.current || (err && err.textStatus === 'abort')) { return; }
        setState(prev => (start ? {...prev, paging: false, more: false, pageError: true} : {...prev, status: 'error', query: q, paging: false}));
      };
      aborter.current = Sefaria.search.execute_query(args);
    }).catch(() => {
      if (my !== token.current) { return; }
      setState(prev => ({...prev, status: 'error', query: q, paging: false}));
    });
  }, [book]);

  // Debounced live search.
  useEffect(() => {
    const q = normalizeQuery(query);
    if (!isSearchable(q)) {
      token.current += 1;
      setState({status: 'idle', query: q, results: emptyResults(), more: false, total: null, paging: false});
      return undefined;
    }
    if (q === stateRef.current.query && stateRef.current.status !== 'error') { return undefined; }
    setState(prev => ({...prev, status: 'loading', query: q}));
    const timer = setTimeout(() => run(q, 0), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  useEffect(() => () => {
    token.current += 1;
    if (aborter.current && aborter.current.abort) { aborter.current.abort(); }
  }, []);

  const loadMore = useCallback(() => {
    const now = stateRef.current;
    if (now.status !== 'ready' || !now.more || now.paging) { return; }
    setState(prev => ({...prev, paging: true, pageError: false}));
    run(now.query, now.results.seen.size);
  }, [run]);

  const retry = useCallback(() => {
    const now = stateRef.current;
    if (!now.query) { return; }
    setState(prev => ({...prev, status: 'loading'}));
    run(now.query, 0);
  }, [run]);

  return {
    status: state.status, query: state.query, rows: state.results.rows, more: state.more, total: state.total,
    paging: state.paging, pageError: !!state.pageError, loadMore, retry,
  };
}

function Snippet({html, lang}) {
  const runs = snippetRuns(html);
  if (!runs.length) { return null; }
  return (
    <span className={`ng-search-snippet ng-search-snippet-${lang}`} lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {runs.map((r, i) => (r.mark ? <mark key={i}>{r.text}</mark> : <React.Fragment key={i}>{r.text}</React.Fragment>))}
    </span>
  );
}

export default function SearchSheet({closing, onClose, onExited}) {
  const reader = useNgReader();
  const {interfaceLang, currentSection, goToRef, searchMemory} = reader;
  const hebrew = interfaceLang === 'hebrew';
  const strings = sheetStrings(interfaceLang);
  const book = currentSection ? currentSection.indexTitle : '';
  const bookName = currentSection ? (hebrew ? currentSection.heIndexTitle : currentSection.indexTitle) : '';
  // The last query in this book comes back when the sheet reopens.
  const remembered = searchMemory && searchMemory.current && searchMemory.current.book === book ? searchMemory.current.query : '';
  const [query, setQuery] = useState(remembered);
  const search = useBookSearch(book, query);
  const inputRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (searchMemory) { searchMemory.current = {book, query}; }
  }, [book, query, searchMemory]);

  const onScroll = useCallback(() => {
    const body = bodyRef.current;
    if (body && body.scrollHeight - body.scrollTop - body.clientHeight < LOAD_MORE_MARGIN) { search.loadMore(); }
  }, [search.loadMore]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) { return undefined; }
    body.addEventListener('scroll', onScroll, {passive: true});
    return () => body.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // A short first page may not fill the sheet: keep loading until it scrolls or runs out.
  useEffect(() => {
    if (search.status === 'ready' && search.more && !search.paging) { onScroll(); }
  }, [search.status, search.rows.length, search.more, search.paging, onScroll]);

  const choose = useCallback((ref) => goToRef(ref, {flash: true}), [goToRef]);
  const label = strings.searchIn(bookName);
  const showQuery = normalizeQuery(query);

  const head = (
    <form className="ng-search-form" role="search" data-ng="search-form" onSubmit={(e) => { e.preventDefault(); if (inputRef.current) { inputRef.current.blur(); } }}>
      <span className="ng-search-field">
        <SearchIcon />
        <input ref={inputRef} className="ng-search-input" data-ng="search-input" type="search" enterKeyHint="search" dir="auto"
               autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck="false"
               aria-label={label} placeholder={strings.searchPlaceholder(bookName)} maxLength={120}
               aria-controls="ng-search-results" aria-describedby="ng-search-status"
               value={query} onChange={(e) => setQuery(e.target.value)} />
        {query ? (
          <button type="button" className="ng-search-clear" data-ng="search-clear" aria-label={strings.clear}
                  onClick={() => { setQuery(''); if (inputRef.current) { inputRef.current.focus(); } }}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 7l10 10M17 7 7 17" /></svg>
          </button>
        ) : null}
      </span>
    </form>
  );

  let status = '';
  if (search.status === 'idle') { status = strings.typeToSearch; }
  if (search.status === 'loading') { status = strings.searching; }
  if (search.status === 'ready') { status = search.rows.length ? strings.results(search.rows.length, search.more) : strings.noResults(showQuery, bookName); }
  if (search.status === 'error') { status = strings.searchFailed; }

  return (
    <BottomSheet name="search" label={label} closing={closing} onClose={onClose} onExited={onExited}
                 initialFocusRef={inputRef} bodyRef={bodyRef} head={head} closeLabel={strings.close}>
      <div className="ng-search" data-ng="search" data-status={search.status} data-book={book || undefined}>
        <p className="ng-search-status" id="ng-search-status" data-ng="search-status" role="status" aria-live="polite">
          {search.status === 'loading' ? <span className="ng-spinner" aria-hidden="true" /> : null}
          <span>{status}</span>
          {search.status === 'error' ? (
            <button type="button" className="ng-sheet-pill" data-ng="search-retry" onClick={search.retry}>{strings.retry}</button>
          ) : null}
        </p>
        {search.rows.length && search.status !== 'error' ? (
          <ol className="ng-search-results" id="ng-search-results" data-ng="search-results" aria-busy={search.status === 'loading'}>
            {search.rows.map(row => (
              <li key={row.ref}>
                <button type="button" className="ng-search-result" data-ng="search-result" data-ref={row.ref} onClick={() => choose(row.ref)}>
                  <span className="ng-search-ref" lang={hebrew ? 'he' : 'en'}>{hebrew ? row.heRef : row.ref}</span>
                  {row.he ? <Snippet html={row.he} lang="he" /> : null}
                  {row.en ? <Snippet html={row.en} lang="en" /> : null}
                </button>
              </li>
            ))}
          </ol>
        ) : null}
        {search.status === 'ready' && search.more ? (
          <div className="ng-search-more">
            {search.paging ? <span className="ng-spinner" aria-hidden="true" /> : (
              <button type="button" className="ng-sheet-pill" data-ng="search-more" onClick={search.loadMore}>{strings.loadMore}</button>
            )}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
