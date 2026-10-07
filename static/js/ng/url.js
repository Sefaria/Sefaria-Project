/**
 * Reader URLs in the classic grammar (ReaderApp.makeHistoryState):
 *   /Genesis.1.3?ven=english|The_JPS_Tanakh&vhe=hebrew|Miqra&with=all&lang=bi
 * Pure functions. They do not depend on the book list from data.js, so they give the same
 * answer on the server, in the browser and in tests.
 */
import {shortLang} from './text';

// The section part of a ref: "1", "1:3", "2a:5", "1:3-5", "1:3-2:4", "2a-3b".
const SECTION_PART_RE = / (\d+[ab]?(?::\d+)*(?:-\d+[ab]?(?::\d+)*)?)$/;

/** "Genesis 1:3" -> "Genesis.1.3", "Shir HaShirim 2" -> "Shir_HaShirim.2", "Berakhot 2a:4" -> "Berakhot.2a.4". */
export function refToUrlPath(ref) {
  if (!ref) { return ''; }
  const match = ref.match(SECTION_PART_RE);
  const title = match ? ref.slice(0, match.index) : ref;
  const sections = match ? '.' + match[1].replace(/:/g, '.') : '';
  return title.replace(/ /g, '_') + sections;
}

export function encodeVersionTitle(vtitle) {
  // Sefaria.util.encodeVtitle
  return vtitle.replace(/\s/g, '_').replace(/;/g, '%3B');
}

export function decodeVersionTitle(vtitle) {
  return vtitle.replace(/_/g, ' ').replace(/%3B/g, ';');
}

/** {en, he} with empty values dropped; the shape Sefaria.getTextFromCurrVersions takes. */
export function normalizeCurrVersions(currVersions) {
  const out = {en: null, he: null};
  for (const lang of ['en', 'he']) {
    const v = currVersions && currVersions[lang];
    if (v && v.versionTitle) {
      out[lang] = {languageFamilyName: v.languageFamilyName || '', versionTitle: v.versionTitle};
    }
  }
  return out;
}

export function versionParams(currVersions) {
  const v = normalizeCurrVersions(currVersions);
  const params = [];
  for (const lang of ['en', 'he']) {
    if (v[lang]) {
      params.push(`v${lang}=${v[lang].languageFamilyName}|${encodeVersionTitle(v[lang].versionTitle)}`);
    }
  }
  return params;
}

/**
 * The URL for a reader state. `connections` is the `with=` value, kept only while the
 * associated panel is showing it.
 */
export function buildReaderUrl({ref, currVersions, language, connections = null}) {
  const params = versionParams(currVersions);
  if (connections) { params.push(`with=${connections.replace(/ /g, '_')}`); }
  params.push(`lang=${shortLang(language)}`);
  return `/${refToUrlPath(ref)}?${params.join('&')}`;
}

/** Links out of the reader. These go to the existing site pages for now. */
export function bookTocUrl(indexTitle) {
  return `/${(indexTitle || '').replace(/ /g, '_')}`;
}

export function searchInBookUrl(section) {
  const path = [...(section.categories || []), section.indexTitle].join('/');
  return `/search?q=&tab=text&tvar=1&tsort=relevance&tpathFilters=${encodeURIComponent(path)}`;
}

export const BROWSE_URL = '/texts';

/** The same page on the classic reader, for the opt-out link. */
export function classicReaderUrl(url) {
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'ng=0';
}
