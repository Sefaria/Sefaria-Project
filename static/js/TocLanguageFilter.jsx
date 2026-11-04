import React, { useState, useEffect } from 'react';
import Sefaria from './sefaria/sefaria';
import {
  categoryPathKey,
  getFilterLanguageOptions,
  getTocLanguageFilterSnapshot,
  initTocLanguageFilter,
  setTocLanguageFilter,
  subscribeTocLanguageFilter,
} from './sefaria/tocLanguageFilter';

// Set once the first hook instance has mounted. Instances rendered during SSR / hydration start
// unfiltered (so client markup matches the server's); instances mounted later read the store directly.
let _clientReady = false;
const EMPTY_SNAPSHOT = {lang: null, data: null};


const useTocLanguageFilter = () => {
  const [snapshot, setSnapshot] = useState(() => _clientReady ? getTocLanguageFilterSnapshot() : EMPTY_SNAPSHOT);
  useEffect(() => {
    _clientReady = true;
    const sync = () => setSnapshot(getTocLanguageFilterSnapshot());
    const unsubscribe = subscribeTocLanguageFilter(sync);
    initTocLanguageFilter();
    sync();
    return unsubscribe;
  }, []);

  const {lang, data} = snapshot;
  const active = !!(lang && data && data.lang === lang);
  return {
    lang,
    active,
    loading: !!lang && !active,
    setLang: setTocLanguageFilter,
    // Unknown paths (not in Sefaria.toc) are treated as matches rather than greyed.
    categoryMatches: cats => !active || data.catMatches.get(categoryPathKey(cats)) !== false,
    bookMatches: title => !active || data.titles.has(title),
    versionMatches: version => !lang || version?.actualLanguage === lang,
  };
};


const languageDisplayName = code => Sefaria.ISOMap?.[code]?.nativeName || code;


const TocLanguageFilter = () => {
  const {lang, loading, setLang} = useTocLanguageFilter();
  const options = getFilterLanguageOptions();
  const label = Sefaria._("toc_language_filter.filter_by_language");
  return (
    <label className={"tocLanguageFilter sans-serif" + (lang ? " active" : "") + (loading ? " loading" : "")}
           title={label}>
      <span className="tocLanguageFilterLabel">{label}</span>
      <select
        value={lang || ""}
        onChange={e => setLang(e.target.value || null)}
        aria-label={label}
        data-anl-event="toc_language_filter:change"
      >
        <option value="">{Sefaria._("toc_language_filter.all_languages")}</option>
        {options.map(code => <option key={code} value={code}>{languageDisplayName(code)}</option>)}
      </select>
    </label>
  );
};


const TocLanguageFilterBookNote = ({title}) => {
  // Shown on a Book TOC when the active filter language has no version of this book.
  const {lang, active, bookMatches} = useTocLanguageFilter();
  if (!active || bookMatches(title)) { return null; }
  const message = Sefaria._("toc_language_filter.no_version_in_language")
    .split("{language}").join(languageDisplayName(lang));
  return <div className="tocLanguageFilterNote sans-serif">{message}</div>;
};


export {
  TocLanguageFilter,
  TocLanguageFilterBookNote,
  useTocLanguageFilter,
};
