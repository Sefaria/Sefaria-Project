/**
 * Pure helpers that turn an /api/v3/texts response into what TextStream renders.
 *
 * The input is either the `text` of the server's initial panel (make_panel_dict, trimmed by
 * reader/ng.py) or the object Sefaria.getTextFromCurrVersions resolves to. Both carry
 * `versions[]` plus the legacy `he` / `text` arrays for the primary and translation versions.
 * Nothing here touches the DOM or browser globals: it runs during Node SSR.
 */
import Sefaria from '../sefaria/sefaria';

export const LANGUAGES = ['hebrew', 'english', 'bilingual'];
const SHORT_LANG = {hebrew: 'he', english: 'en', bilingual: 'bi'};
const LONG_LANG = {he: 'hebrew', en: 'english', bi: 'bilingual'};

export const shortLang = (language) => SHORT_LANG[language] || 'bi';
export const longLang = (code) => LONG_LANG[code] || (LANGUAGES.includes(code) ? code : null);

// Same patterns TextRange uses for the `vowels` and `punctuationTalmud` settings.
const CANTILLATION_RE = /[֑-ֽֿ֯׀ׅׄ‍]/g;
const CANTILLATION_AND_NIKUD_RE = /[֑-ֽֿ-ׇׅ‍]/g;
const TALMUD_PUNCTUATION_RE = /[\.\!\?\:\,״]+(?![֑-ֽֿ-ׇׅ‍א-ת](?:[\.\!\?\:\,״\s]|$))|[—–]\s/g;

export function pickVersions(versions = []) {
  // Mirrors Sefaria.getPrimaryAndTranslationFromVersions, tolerating 0 or 1 versions.
  if (!versions.length) { return [null, null]; }
  if (versions.length === 1) {
    return versions[0].isPrimary || versions[0].isSource ? [versions[0], null] : [null, versions[0]];
  }
  const [a, b] = versions;
  return a.isPrimary && !b.isSource ? [a, b] : [b, a];
}

function versionMeta(version, fallbackDirection) {
  if (!version) { return null; }
  return {
    versionTitle: version.versionTitle,
    versionTitleInHebrew: version.versionTitleInHebrew || null,
    shortVersionTitle: version.shortVersionTitle || null,
    languageFamilyName: version.languageFamilyName,
    lang: version.actualLanguage || version.language || null,
    direction: version.direction || fallbackDirection,
    formatAsPoetry: !!version.formatAsPoetry,
    isPrimary: !!version.isPrimary,
  };
}

function asArray(value) {
  if (Array.isArray(value)) { return value; }
  if (typeof value === 'string') { return [value]; }
  return [];
}

function firstOffset(data) {
  // Same source as Sefaria._get_offsets: where numbering starts inside this section.
  const offsets = data.index_offsets_by_depth && data.index_offsets_by_depth[String(data.textDepth)];
  if (typeof offsets === 'number') { return offsets; }
  if (Array.isArray(offsets)) {
    const flat = [].concat(...offsets.map(o => (Array.isArray(o) ? o : [o])));
    return typeof flat[0] === 'number' ? flat[0] : 0;
  }
  return 0;
}

/**
 * The ref of the section a (possibly segment-level) ref belongs to, as the API reports it.
 */
export function sectionRefOf(data) {
  return data.sectionRef || data.ref;
}

/**
 * Normalize one API response into a section: metadata plus a flat list of segments.
 * Only section-level (non-spanning) data is supported; spanning data keeps its first section.
 */
export function sectionFromApi(data) {
  if (!data || data.error) { return null; }
  const [primaryVersion, translationVersion] = pickVersions(data.versions);
  const primary = versionMeta(primaryVersion, 'rtl');
  const translation = versionMeta(translationVersion, 'ltr');
  let he = asArray(data.he);
  let en = asArray(data.text);
  if (data.isSpanning) {
    // Spanning refs return one array per section. NG streams sections, so keep the first.
    he = asArray(he[0]);
    en = asArray(en[0]);
  }
  const ref = sectionRefOf(data);
  const heRef = data.heSectionRef || data.heRef || ref;
  const depth = data.textDepth || 2;
  const delim = depth === 1 ? ' ' : ':';
  const start = 1 + firstOffset(data);
  const length = Math.max(he.length, en.length);
  const segments = [];
  for (let i = 0; i < length; i++) {
    const heText = typeof he[i] === 'string' ? he[i] : '';
    const enText = typeof en[i] === 'string' ? en[i] : '';
    if (!heText && !enText) { continue; }
    const number = start + i;
    segments.push({
      ref: `${ref}${delim}${number}`,
      heRef: `${heRef}${delim}${hebrewRefNumeral(number)}`,
      number,
      he: heText,
      en: enText,
    });
  }
  return {
    ref,
    heRef,
    next: data.next || null,
    prev: data.prev || null,
    indexTitle: data.indexTitle || data.book,
    heIndexTitle: data.heIndexTitle || data.heTitle || data.indexTitle || data.book,
    categories: data.categories || [],
    primaryCategory: data.primary_category || (data.categories || [])[0] || null,
    type: data.type || null,
    // A segment ref loaded with its context still describes a section here.
    sections: (data.sections || []).slice(0, data.sections && data.sections.length === depth ? depth - 1 : undefined),
    sectionNames: data.sectionNames || [],
    addressTypes: data.addressTypes || [],
    primary,
    translation,
    segments,
  };
}

/**
 * The segments of a loaded section that a ref names: a segment ("Genesis 1:3"), a range inside
 * the section ("Rashi on Genesis 1:1:1-3"), or a range running past it ("Genesis 1:29-2:3", to
 * the section's end). The same expansion the server makes for a range URL's highlight
 * (make_panel_dict's highlightedRefs). [] for the section itself, or a ref elsewhere.
 */
export function segmentRefsIn(ref, section) {
  if (!ref || !section || ref === section.ref) { return []; }
  const direct = section.segments.find(s => s.ref === ref);
  if (direct) { return [ref]; }
  const dash = ref.lastIndexOf('-');
  if (dash === -1 || !/^\d+[ab]?(?::\d+)*$/.test(ref.slice(dash + 1))) { return []; }
  const start = section.segments.find(s => s.ref === ref.slice(0, dash));
  if (!start) { return []; }
  const end = ref.slice(dash + 1).split(':');
  // "…:1-3" ends inside this section; "…:29-2:3" (more parts) ends in a later one.
  const last = end.length === 1 ? Number(end[0]) : Infinity;
  return section.segments.filter(s => s.number >= start.number && s.number <= last).map(s => s.ref);
}

/**
 * Whether `ref` is in the same book as `section` ("Genesis 3:4" and Genesis, but not
 * "Genesis Rabbah 1:1"), so the reader's chosen versions still apply to it.
 */
export function inSameBook(ref, section) {
  const title = section && section.indexTitle;
  if (!ref || !title || ref.indexOf(`${title} `) !== 0) { return false; }
  return /^\d+[ab]?(?::\d+)*(?:-\d+[ab]?(?::\d+)*)?$/.test(ref.slice(title.length + 1));
}

/** Which texts a segment shows for a content language, with the classic fallbacks. */
export function visibleTexts(segment, language) {
  const hasHe = !!segment.he;
  const hasEn = !!segment.en;
  if (language === 'hebrew') { return {he: hasHe || !hasEn, en: !hasHe && hasEn}; }
  if (language === 'english') { return {he: !hasEn && hasHe, en: hasEn}; }
  return {he: hasHe, en: hasEn};
}

/**
 * Keep an em or en dash on the line of the word before it (a WORD JOINER stops the browser
 * breaking there), so a verse never starts a line with a lone "—".
 */
export function bindDashes(html) {
  return html ? html.replace(/([^\s>])([\u2014\u2013])/g, '$1\u2060$2') : html;
}

/** Wrap each <br>-separated line in a span so poetry can hang-indent (as TextSegment.addPoetrySpans). */
export function addPoetrySpans(html) {
  if (!html || html.indexOf('<br') === -1 || html.indexOf('class="poetry') !== -1) { return html; }
  return html.split(/<br\s*\/?>/).map(line => `<span class="poetry indentWhenWrap">${line}</span>`).join('<br>');
}

export function stripHebrewMarks(html, {vowels = 'all', punctuationTalmud = 'punctuationOn'} = {}, isTalmud = false) {
  let out = html;
  if (vowels === 'partial') { out = out.replace(CANTILLATION_RE, ''); }
  if (vowels === 'none') { out = out.replace(CANTILLATION_AND_NIKUD_RE, ''); }
  if (isTalmud && punctuationTalmud === 'punctuationOff') { out = out.replace(TALMUD_PUNCTUATION_RE, ''); }
  return out;
}

/** The layout setting that applies to a section's category, as ReaderPanel.getLayoutCategory. */
export function layoutKeyFor(section) {
  const category = section && section.primaryCategory;
  return category === 'Tanakh' || category === 'Talmud' ? `layout${category}` : 'layoutDefault';
}

export function isTalmud(section) {
  return !!section && (section.addressTypes[0] === 'Talmud' || section.primaryCategory === 'Talmud');
}

/** Segment numbers in the margin: shown for most texts, not for liturgy and reference works. */
export function showsSegmentNumbers(section) {
  const top = section && section.categories[0];
  return top !== 'Liturgy' && top !== 'Reference';
}

export function segmentNumberLabel(number, useHebrew) {
  return useHebrew ? Sefaria.hebrew.encodeHebrewNumeral(number, false) : String(number);
}

/** A Hebrew numeral as it appears in a ref: "א׳", "י״ב", "קכ״ג". */
export function hebrewRefNumeral(number) {
  const letters = Sefaria.hebrew.encodeHebrewNumeral(number).replace(/[\u05f3\u05f4'"]/g, '');
  if (letters.length <= 1) { return `${letters}\u05f3`; }
  return `${letters.slice(0, -1)}\u05f4${letters.slice(-1)}`;
}

const HE_SECTION_NAMES = {
  Chapter: 'פרק', Perek: 'פרק', Daf: 'דף', Siman: 'סימן', Mishnah: 'משנה', Halakhah: 'הלכה',
  Psalm: 'מזמור', Parasha: 'פרשה', Seif: 'סעיף',
};

function remainderAfter(fullRef, title) {
  if (!fullRef || !title || fullRef.indexOf(title) !== 0) { return null; }
  return fullRef.slice(title.length).replace(/^[,\s]+/, '');
}

/**
 * "Chapter 1", "Daf 2a", "פרק א׳", "דף ב." — the label for a section inside its book, as
 * {name, address} so the two can be set differently. `name` may be empty.
 */
export function sectionLabelParts(section, useHebrew) {
  const label = sectionLabel(section, useHebrew);
  const space = label.lastIndexOf(' ');
  return space > 0 ? {name: label.slice(0, space), address: label.slice(space + 1)} : {name: '', address: label};
}

export function sectionLabel(section, useHebrew) {
  if (!section) { return ''; }
  const name = section.sectionNames[section.sectionNames.length - 2] || '';
  const address = section.sections[section.sections.length - 1];
  if (useHebrew) {
    const heName = HE_SECTION_NAMES[name];
    if (heName && isTalmud(section) && /^\d+[ab]$/.test(String(address))) {
      return `${heName} ${Sefaria.hebrew.encodeHebrewDaf(String(address))}`;
    }
    const rest = remainderAfter(section.heRef, section.heIndexTitle);
    if (heName && rest && !/\s/.test(rest)) {
      return `${heName} ${rest}`;
    }
    return rest || section.heRef;
  }
  const rest = remainderAfter(section.ref, section.indexTitle);
  if (rest && /^\d+[ab]?$/.test(rest) && name) {
    return `${name} ${rest}`;
  }
  return rest || section.ref;
}
