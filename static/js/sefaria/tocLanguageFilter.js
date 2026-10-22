/*
 * Library TOC "Filter by Language" (POC).
 *
 * One shared, SSR-safe store for the language the reader chose, persisted in localStorage so it
 * carries across the whole TOC depth: library home -> category pages -> sub-categories -> Book TOC.
 *
 * - The language options are the same ones the homepage "Translations" sidebar widget lists
 *   (Sefaria.ISOMap entries with showTranslations).
 * - A book "matches" when it has at least one Version whose actualLanguage equals the chosen code
 *   (the same key /translations/<lang> uses). The list of matching titles comes from
 *   /api/texts/translation-titles/<lang> and is cached per language.
 * - A category "matches" when anything anywhere below it in Sefaria.toc matches.
 */
import Sefaria from './sefaria';

const STORAGE_KEY = "sefaria.tocLanguageFilter";

// ----- Pure helpers (unit-tested) -----

export const categoryPathKey = cats => (cats || []).join("|");

export function computeCategoryMatches(toc, titleSet) {
  /* Walks the TOC tree once and returns a Map of category path key ("Tanakh|Torah") -> boolean,
   * true when some visible book anywhere below that category is in `titleSet`. */
  const matches = new Map();
  const walk = (nodes, path) => {
    let any = false;
    for (const node of nodes || []) {
      if (node.category) {
        const childPath = path.concat(node.category);
        const childMatch = walk(node.contents, childPath);
        matches.set(categoryPathKey(childPath), childMatch);
        any = any || childMatch;
      } else if (!node.hidden && !node.isCollection && node.title && titleSet.has(node.title)) {
        any = true;
      }
    }
    return any;
  };
  walk(toc, []);
  return matches;
}

export function buildMatchData(lang, titles, toc) {
  const titleSet = new Set(titles || []);
  return {lang, titles: titleSet, catMatches: computeCategoryMatches(toc, titleSet)};
}

export function getFilterLanguageOptions() {
  // Exactly the languages shown in the homepage Translations widget.
  const isoMap = Sefaria.ISOMap || {};
  return Object.keys(isoMap).filter(code => isoMap[code]["showTranslations"]);
}

const isValidLanguage = lang => !!lang && getFilterLanguageOptions().includes(lang);

// ----- Store -----

let _lang = null;
let _initialized = false;
let _snapshot = {lang: null, data: null};
const _matchData = {};   // lang -> match data
const _requests = {};    // lang -> Promise
const _listeners = new Set();

const _emit = () => {
  _snapshot = {lang: _lang, data: _lang ? (_matchData[_lang] || null) : null};
  _listeners.forEach(fn => fn());
};

const _readStorage = () => {
  try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
};
const _writeStorage = lang => {
  try {
    if (lang) { window.localStorage.setItem(STORAGE_KEY, lang); }
    else { window.localStorage.removeItem(STORAGE_KEY); }
  } catch (e) {}
};

function _load(lang) {
  if (_matchData[lang] || _requests[lang]) { return; }
  const url = `${Sefaria.apiHost}/api/texts/translation-titles/${encodeURIComponent(lang)}`;
  // _ApiPromise returns a jQuery deferred (no .catch), so assimilate it into a native Promise.
  _requests[lang] = Promise.resolve().then(() => Sefaria._ApiPromise(url)).then(response => {
    _matchData[lang] = buildMatchData(lang, response?.titles, Sefaria.toc);
    if (_lang === lang) { _emit(); }
  }).catch(e => {
    console.warn("Failed to load titles for language filter", lang, e);
    delete _requests[lang];
  });
}

export function initTocLanguageFilter() {
  // Client only; call after mount. Reads the persisted choice once.
  if (_initialized || typeof window === "undefined") { return; }
  _initialized = true;
  const stored = _readStorage();
  if (isValidLanguage(stored)) {
    _lang = stored;
    _load(stored);
    _emit();
  }
}

export function getTocLanguageFilterSnapshot() {
  return _snapshot;
}

export function setTocLanguageFilter(lang) {
  lang = isValidLanguage(lang) ? lang : null;
  _initialized = true;
  if (lang === _lang) { return; }
  _lang = lang;
  _writeStorage(lang);
  if (lang) { _load(lang); }
  _emit();
}

export function subscribeTocLanguageFilter(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// For tests
export function _resetTocLanguageFilterForTests() {
  _lang = null;
  _initialized = false;
  _snapshot = {lang: null, data: null};
  Object.keys(_matchData).forEach(k => delete _matchData[k]);
  Object.keys(_requests).forEach(k => delete _requests[k]);
  _listeners.clear();
}
