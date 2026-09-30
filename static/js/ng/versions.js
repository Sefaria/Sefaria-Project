/**
 * Pure helpers for the config panel's version pickers. They order and label the versions the
 * data layer returns (Sefaria.getVersions: {actualLanguage: [version, ...]}); they never pick
 * a default. Which version the reader sees by default is the server's decision (highest
 * `priority`, then isPrimary), and NG shows whatever the text API returned.
 */

const LANGUAGE_SUFFIX_RE = /\s*\[[a-z]{2,3}\]\s*$/;

/** Every version, flattened out of the data layer's language buckets. */
export function flattenVersions(byLanguage) {
  if (!byLanguage) { return []; }
  return Array.isArray(byLanguage) ? byLanguage.slice() : [].concat(...Object.values(byLanguage));
}

export const versionLanguage = (v) => v.actualLanguage || v.language || '';

/** Higher `priority` first (missing counts as 0); the API's order breaks ties. */
export function byPriority(versions) {
  return versions
    .map((v, i) => [v, i])
    .sort(([a, i], [b, j]) => ((b.priority || 0) - (a.priority || 0)) || (i - j))
    .map(([v]) => v);
}

/** Same identity the classic reader uses for a version: its title within a language family. */
export function sameVersion(a, b) {
  return !!a && !!b && a.versionTitle === b.versionTitle
    && (!a.languageFamilyName || !b.languageFamilyName || a.languageFamilyName === b.languageFamilyName);
}

export function versionKey(v) {
  return `${v.languageFamilyName || ''}|${v.versionTitle}`;
}

/**
 * Split versions into the source picker (isSource) and the translation picker, the translations
 * grouped by language: the reader's translation-language preference first, then English, then
 * the rest alphabetically by their name in the interface language.
 */
export function groupVersions(byLanguage, {translationLanguagePreference = null, interfaceLang = 'english'} = {}) {
  const all = flattenVersions(byLanguage);
  const sources = byPriority(all.filter(v => v.isSource));
  const buckets = new Map();
  for (const v of byPriority(all.filter(v => !v.isSource))) {
    const lang = versionLanguage(v);
    if (!buckets.has(lang)) { buckets.set(lang, []); }
    buckets.get(lang).push(v);
  }
  const rank = (lang) => (lang === translationLanguagePreference ? 0 : lang === 'en' ? 1 : 2);
  const translations = Array.from(buckets, ([lang, versions]) => ({
    lang, name: languageName(lang, interfaceLang, versions[0] && versions[0].languageFamilyName), versions,
  })).sort((a, b) => (rank(a.lang) - rank(b.lang)) || a.name.localeCompare(b.name, interfaceLang === 'hebrew' ? 'he' : 'en'));
  return {sources, translations};
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "Spanish" / "ספרדית" for "es". Falls back to the version's languageFamilyName. */
export function languageName(code, interfaceLang = 'english', familyName = '') {
  const locale = interfaceLang === 'hebrew' ? 'he' : 'en';
  try {
    if (code && typeof Intl !== 'undefined' && Intl.DisplayNames) {
      const name = new Intl.DisplayNames([locale], {type: 'language'}).of(code);
      if (name && name !== code) { return capitalize(name); }
    }
  } catch (e) { /* unknown code: fall through */ }
  return capitalize(familyName || code || '');
}

/** The name to list a version under: its short title if it has one, without the "[es]" suffix. */
export function versionDisplayTitle(v, interfaceLang = 'english') {
  if (!v) { return ''; }
  const hebrew = interfaceLang === 'hebrew';
  const title = (hebrew && (v.shortVersionTitleInHebrew || v.versionTitleInHebrew)) || v.shortVersionTitle || v.versionTitle || '';
  return title.replace(LANGUAGE_SUFFIX_RE, '').trim();
}

/** The full title, when it says more than the display title. */
export function versionFullTitle(v, interfaceLang = 'english') {
  if (!v) { return ''; }
  const full = ((interfaceLang === 'hebrew' && v.versionTitleInHebrew) || v.versionTitle || '').replace(LANGUAGE_SUFFIX_RE, '').trim();
  return full === versionDisplayTitle(v, interfaceLang) ? '' : full;
}

export function versionNotes(v, interfaceLang = 'english') {
  if (!v) { return ''; }
  return ((interfaceLang === 'hebrew' && v.versionNotesInHebrew) || v.versionNotes || '').trim();
}

/**
 * After choosing a version, show it: picking a translation while reading the source only (or
 * a source version while reading the translation only) switches to bilingual, as in the classic
 * reader's _getPanelLangOnVersionChange.
 */
export function languageAfterVersionChoice(language, isSource) {
  if (isSource && language === 'english') { return 'bilingual'; }
  if (!isSource && language === 'hebrew') { return 'bilingual'; }
  return language;
}

/** The currVersions entry a choice sets: `he` for the source, `en` for the translation (any language). */
export function currVersionsWith(currVersions, version) {
  const slot = version.isSource ? 'he' : 'en';
  return {...(currVersions || {en: null, he: null}), [slot]: {languageFamilyName: version.languageFamilyName || '', versionTitle: version.versionTitle}};
}
