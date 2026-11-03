/**
 * Versions of the current book and the text of one version for a ref, through the existing data
 * layer (`book.data.versions` from the reader's `/api/texts` response, `Sefaria.getVersions`,
 * `Sefaria.getText` with `enVersion` / `heVersion`). Shared by Versions compare (scholar) and
 * Compare translations (educator). Pure helpers are jest-covered; fetching is mocked in tests.
 */
import Sefaria from '../../../sefaria/sefaria';
import { plainText } from '../../reader/textData';

const flat = v => (v === undefined || v === null ? [] : (Array.isArray(v) ? v.flat(Infinity) : [v]));
const langOf = v => v.actualLanguage || v.language || '';

/** `book.data.versions` (flat) or the by-language buckets `Sefaria.getVersions` returns, as one list. */
export function allVersions(source) {
  if (!source) { return []; }
  if (Array.isArray(source)) { return source; }
  if (source.data && Array.isArray(source.data.versions)) { return source.data.versions; }
  return Object.values(source).flat();
}

/** Versions in `lang` ('he' | 'en'), deduplicated by title and sorted by priority then title. */
export function versionsFor(source, lang) {
  const seen = new Set();
  return allVersions(source)
    .filter(v => v && v.versionTitle && langOf(v) === lang)
    .filter(v => { if (seen.has(v.versionTitle)) { return false; } seen.add(v.versionTitle); return true; })
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.versionTitle.localeCompare(b.versionTitle));
}

/** English translations only: `language === 'en'` and not a translation into another language (`[de]`, `[ru]`). */
export function englishTranslations(source) {
  return versionsFor(source, 'en').filter(v => !/\[[a-z]{2,3}\]\s*$/i.test(v.versionTitle));
}

/** Title in the interface language; falls back to the English title. */
export function versionName(v, lang) {
  if (!v) { return ''; }
  return (lang === 'he' && v.versionTitleInHebrew) || v.versionTitle || '';
}

/** The default pair to compare: the two highest-priority versions, or the current one first when known. */
export function defaultPair(versions, currentTitle) {
  const titles = versions.map(v => v.versionTitle);
  if (!titles.length) { return ['', '']; }
  const first = currentTitle && titles.includes(currentTitle) ? currentTitle : titles[0];
  const second = titles.find(t => t !== first) || '';
  return [first, second];
}

/** Lines of plain text from a `/api/texts` payload field (string, list, or nested list). */
export function textLines(value) {
  return flat(value).map(plainText).filter(Boolean);
}

/**
 * `{ versionTitle, lines, text }` of `versionTitle` for `ref` in `lang`. Resolves to empty lines
 * when the version has nothing for this ref (the API falls back; we check the title it served).
 */
export async function fetchVersionText(ref, versionTitle, lang) {
  const key = lang === 'he' ? 'heVersion' : 'enVersion';
  const data = await Sefaria.getText(ref, { [key]: versionTitle, context: 0, commentary: 0, stripItags: 1 });
  const served = lang === 'he' ? data.heVersionTitle : data.versionTitle;
  const lines = served && served !== versionTitle ? [] : textLines(lang === 'he' ? data.he : data.text);
  return { versionTitle, lines, text: lines.join('\n'), served: served || '' };
}
