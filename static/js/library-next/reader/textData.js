/**
 * Pure data shaping for the reader: /api/texts responses → segments, versions → groups,
 * /api/links → a connections summary, selections → refs, HTML → plain text and citations.
 * No React, no fetching; jest-covered in tests/textData.test.js.
 */
import Sefaria from '../../sefaria/sefaria';
import { refToPath } from './refKind';

// Hebrew combining marks. Cantillation (ta'amim) is U+0591–U+05AF; vowels (nikkud) U+05B0–U+05BD,
// U+05BF, U+05C1, U+05C2, U+05C4, U+05C5, U+05C7. Maqaf (05BE), paseq (05C0) and sof pasuq (05C3) stay.
export const CANTILLATION_RE = /[֑-֯]/g;
export const NIKKUD_RE = /[֑-ׇֽֿׁׂׅׄ]/g;

/** Strip vowels and/or cantillation from a Hebrew HTML string (marks never occur inside tags). */
export function stripHebrewMarks(html, { vowels = true, cantillation = true } = {}) {
  if (!html) { return html || ''; }
  if (!vowels) { return html.replace(NIKKUD_RE, ''); }
  if (!cantillation) { return html.replace(CANTILLATION_RE, ''); }
  return html;
}

/** Hebrew numeral in Sefaria's ref style: geresh after one letter (א׳), gershayim before the last of several (ל״א). */
export function hebrewNumeral(n) {
  const s = Sefaria.hebrew.encodeHebrewNumeral(n) || String(n);
  if (!/^[\u05D0-\u05EA]+$/.test(s)) { return s; }
  return s.length === 1 ? `${s}\u05F3` : `${s.slice(0, -1)}\u05F4${s.slice(-1)}`;
}

/** `{ title, position }` of the current section in one language: "Genesis" + "1", "בראשית" + "א׳". */
export function sectionParts(data, lang) {
  const title = (lang === 'he' ? (data.heIndexTitle || data.heTitle) : data.indexTitle) || data.book || '';
  const ref = (lang === 'he' ? (data.heSectionRef || data.heRef) : (data.sectionRef || data.ref)) || '';
  return { title, position: title && ref.startsWith(title) ? ref.slice(title.length).trim() : ref };
}

const asArray = v => (v === undefined || v === null ? [] : (Array.isArray(v) ? v : [v]));

/**
 * Flatten a text response (`context=1`, so `text`/`he` hold the whole section) into segments:
 * `{ ref, heRef, n, label, heLabel, en, he, sectionRef, heSectionRef, path }`. One nesting level
 * deeper than the section (a depth-3 text requested at depth 1) flattens to `i:j` labels.
 */
export function buildSegments(data) {
  const en = asArray(data.text);
  const he = asArray(data.he);
  const sectionRef = data.sectionRef || data.ref;
  const heSectionRef = data.heSectionRef || data.heRef || sectionRef;
  const out = [];
  const count = Math.max(en.length, he.length);
  for (let i = 0; i < count; i++) {
    const e = en[i]; const h = he[i];
    if (Array.isArray(e) || Array.isArray(h)) {
      const ee = asArray(e); const hh = asArray(h);
      const inner = Math.max(ee.length, hh.length);
      for (let j = 0; j < inner; j++) {
        if (!ee[j] && !hh[j]) { continue; }
        out.push(segment({ sectionRef, heSectionRef, path: [i, j], en: ee[j], he: hh[j], n: out.length + 1 }));
      }
    } else {
      if (!e && !h) { continue; }
      out.push(segment({ sectionRef, heSectionRef, path: [i], en: e, he: h, n: out.length + 1 }));
    }
  }
  return out;
}

function segment({ sectionRef, heSectionRef, path, en, he, n }) {
  const tail = path.map(i => i + 1);
  return {
    ref: `${sectionRef}:${tail.join(':')}`,
    heRef: `${heSectionRef}:${tail.map(hebrewNumeral).join(':')}`,
    n,
    label: tail.join(':'),
    heLabel: tail.map(hebrewNumeral).join(':'),
    en: typeof en === 'string' ? en : '',
    he: typeof he === 'string' ? he : '',
    sectionRef,
    heSectionRef,
    path,
  };
}

export function isSegmentLevel(data) {
  return Array.isArray(data.sections) && data.sections.length === Number(data.textDepth);
}

/** Zero-based inclusive `{ from, to }` of the requested segments within the section, or null for a section ref. */
export function highlightRange(data) {
  if (!isSegmentLevel(data)) { return null; }
  const from = parseInt(data.sections[data.sections.length - 1], 10);
  const to = parseInt((data.toSections || data.sections)[data.sections.length - 1], 10);
  if (Number.isNaN(from)) { return null; }
  return { from: from - 1, to: (Number.isNaN(to) ? from : to) - 1 };
}

const LANG_ORDER = ['he', 'en'];

/** Versions grouped by language, Hebrew first then English then the rest; each group sorted by priority (desc) then title. */
export function groupVersions(versions) {
  const groups = {};
  for (const v of versions || []) {
    const lang = v.actualLanguage || v.language || 'other';
    (groups[lang] = groups[lang] || []).push(v);
  }
  const byTitle = (a, b) => (b.priority || 0) - (a.priority || 0) || (a.versionTitle || '').localeCompare(b.versionTitle || '');
  return Object.keys(groups)
    .sort((a, b) => {
      const ia = LANG_ORDER.indexOf(a); const ib = LANG_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) { return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib); }
      return a.localeCompare(b);
    })
    .map(lang => ({ lang, versions: groups[lang].slice().sort(byTitle) }));
}

/** The Hebrew-language groups ("source") and everything else ("translation") for the two selects. */
export function splitVersionGroups(groups) {
  return {
    source: groups.filter(g => g.lang === 'he'),
    translation: groups.filter(g => g.lang !== 'he'),
  };
}

export function versionLabel(v, lang) {
  if (lang === 'he' && v.versionTitleInHebrew) { return v.versionTitleInHebrew; }
  return v.versionTitle || '';
}

// Commentators shown first inside "Commentary"; everything else follows by count.
export const MAJOR_COMMENTATORS = [
  'Rashi', 'Tosafot', 'Ibn Ezra', 'Ramban', 'Rashbam', 'Sforno', 'Radak', 'Or HaChaim', 'Rabbeinu Bahya',
  'Chizkuni', 'Kli Yakar', 'Malbim', 'Steinsaltz', 'Rif', 'Rosh', 'Ran', 'Rashba', 'Ritva', 'Meiri',
  'Bartenura', 'Rambam', 'Tosafot Yom Tov', 'Ikar Tosafot Yom Tov', 'Siftei Chakhamim', 'Gur Aryeh',
];

export const CATEGORY_ORDER = [
  'Commentary', 'Targum', 'Tanakh', 'Mishnah', 'Talmud', 'Tosefta', 'Midrash', 'Halakhah', 'Kabbalah',
  'Jewish Thought', 'Chasidut', 'Musar', 'Liturgy', 'Responsa', 'Second Temple', 'Reference', 'Essay',
];

export const CITED_BY_CATEGORY = 'Quoting Commentary';

/**
 * Group raw links (`/api/links/<ref>?with_text=0`) into
 * `{ total, categories: [{ category, count, hasEnglish, books: [{ title, heTitle, indexTitle, count, hasEnglish, links }] }], citedBy }`.
 * Categories follow CATEGORY_ORDER (others by count); books by major commentators then count; "Quoting
 * Commentary" is split out as `citedBy` (same shape as a category) for progressive disclosure.
 */
export function groupConnections(links) {
  const cats = {};
  for (const link of links || []) {
    const category = link.category || 'Other';
    const cat = cats[category] || (cats[category] = { category, count: 0, hasEnglish: false, books: {} });
    cat.count += 1;
    cat.hasEnglish = cat.hasEnglish || !!link.sourceHasEn;
    const title = (link.collectiveTitle && link.collectiveTitle.en) || link.index_title || '?';
    const book = cat.books[title] || (cat.books[title] = {
      title,
      heTitle: (link.collectiveTitle && link.collectiveTitle.he) || link.heTitle || title,
      indexTitle: link.index_title || title,
      category,
      count: 0,
      hasEnglish: false,
      links: [],
    });
    book.count += 1;
    book.hasEnglish = book.hasEnglish || !!link.sourceHasEn;
    book.links.push(link);
  }
  const majorRank = title => { const i = MAJOR_COMMENTATORS.indexOf(title); return i === -1 ? MAJOR_COMMENTATORS.length : i; };
  const finish = cat => ({
    ...cat,
    books: Object.values(cat.books)
      .map(b => ({ ...b, links: b.links.slice().sort(byPosition) }))
      .sort((a, b) => (cat.category === 'Commentary' ? majorRank(a.title) - majorRank(b.title) : 0) || b.count - a.count || a.title.localeCompare(b.title)),
  });
  const catRank = c => { const i = CATEGORY_ORDER.indexOf(c); return i === -1 ? CATEGORY_ORDER.length : i; };
  const categories = Object.values(cats)
    .filter(c => c.category !== CITED_BY_CATEGORY)
    .sort((a, b) => catRank(a.category) - catRank(b.category) || b.count - a.count || a.category.localeCompare(b.category))
    .map(finish);
  const citedBy = cats[CITED_BY_CATEGORY] ? finish(cats[CITED_BY_CATEGORY]) : null;
  return { total: (links || []).length, categories, citedBy };
}

function byPosition(a, b) {
  return (a.commentaryNum || 0) - (b.commentaryNum || 0) || (a.sourceRef || '').localeCompare(b.sourceRef || '');
}

/** Ref (and Hebrew ref) covering a contiguous run of segments: `Genesis 1:3-5`, `Genesis 1:30-2:2`. */
export function selectionRef(segments) {
  if (!segments || !segments.length) { return { ref: '', heRef: '' }; }
  const first = segments[0]; const last = segments[segments.length - 1];
  if (segments.length === 1) { return { ref: first.ref, heRef: first.heRef }; }
  if (first.sectionRef === last.sectionRef) {
    let i = 0;
    while (i < first.path.length - 1 && first.path[i] === last.path[i]) { i++; }
    const tail = last.path.slice(i).map(x => x + 1);
    return { ref: `${first.ref}-${tail.join(':')}`, heRef: `${first.heRef}-${tail.map(hebrewNumeral).join(':')}` };
  }
  const bookEn = commonPrefix(first.sectionRef, last.sectionRef).replace(/[\s:]+$/, '');
  const bookHe = commonPrefix(first.heSectionRef, last.heSectionRef).replace(/[\s:]+$/, '');
  return {
    ref: `${first.ref}-${last.ref.slice(bookEn.length).replace(/^[\s:]+/, '')}`,
    heRef: `${first.heRef}-${last.heRef.slice(bookHe.length).replace(/^[\s:]+/, '')}`,
  };
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) { i++; }
  return a.slice(0, i);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Text content of a segment's HTML: footnote bodies and markers dropped, tags removed, entities decoded. */
export function plainText(html) {
  if (!html) { return ''; }
  return html
    .replace(/<i class="footnote">[\s\S]*?<\/i>/g, '')
    .replace(/<sup class="footnote-marker">[\s\S]*?<\/sup>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m))
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** `{ en, he }` plain text of a selection's segments, one line per segment. */
export function selectionText(segments, { vowels = true, cantillation = true } = {}) {
  return {
    en: segments.map(s => plainText(s.en)).filter(Boolean).join('\n'),
    he: segments.map(s => plainText(stripHebrewMarks(s.he, { vowels, cantillation }))).filter(Boolean).join('\n'),
  };
}

export function canonicalUrl(ref) {
  return `https://www.sefaria.org${refToPath(ref)}`;
}

/**
 * A citation string. `simple`: ref, version, Sefaria, URL. `chicago` (notes style): ref, work,
 * version/translator, Sefaria, access date, URL.
 */
export function citation({ ref, book, versionTitle, style = 'simple', lang = 'en', date = new Date(), accessedWord = 'accessed' }) {
  const url = canonicalUrl(ref);
  const version = versionTitle ? `${versionTitle}` : '';
  if (style === 'chicago') {
    const accessed = date.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const parts = [`${ref}`, book && book !== ref.replace(/ [\d:a-z-]+$/, '') ? `in ${book}` : null, version || null, `Sefaria`, `${accessedWord} ${accessed}`];
    return `${parts.filter(Boolean).join(', ')}, ${url}.`;
  }
  return [ref, version, 'Sefaria', url].filter(Boolean).join('. ') + '.';
}

const SECTION_NAMES_HE = {
  Chapter: 'פרק', Verse: 'פסוק', Daf: 'דף', Line: 'שורה', Mishnah: 'משנה', Halakhah: 'הלכה', Siman: 'סימן',
  Seif: 'סעיף', Paragraph: 'פסקה', Comment: 'פירוש', Section: 'חלק', Segment: 'קטע', Parasha: 'פרשה', Psalm: 'מזמור',
};

/** `{ en, he }` position labels for the header: "Chapter 1" / "פרק א׳", "Daf 2a" / "דף ב׳ א"; deeper sections show "1:1". */
export function positionLabel(data) {
  const strip = (ref, title) => (title && ref && ref.startsWith(title) ? ref.slice(title.length).trim() : (ref || ''));
  const en = strip(data.sectionRef || data.ref, data.indexTitle);
  const he = strip(data.heSectionRef || data.heRef, data.heIndexTitle);
  const names = data.sectionNames || [];
  const name = names.length === 2 ? names[0] : null;
  if (!name) { return { en, he }; }
  return { en: `${name} ${en}`.trim(), he: `${SECTION_NAMES_HE[name] || ''} ${he}`.trim() };
}

/** `{ title, heTitle, categories, primaryCategory, ... }` for tool components and the header. */
export function bookInfo(data) {
  return {
    title: data.indexTitle || data.book,
    heTitle: data.heIndexTitle || data.heTitle || data.indexTitle,
    categories: data.categories || [],
    primaryCategory: data.primary_category || (data.categories || [])[0] || '',
    sectionRef: data.sectionRef,
    heSectionRef: data.heSectionRef,
    versionTitle: data.versionTitle || '',
    heVersionTitle: data.heVersionTitle || '',
    next: data.next || null,
    prev: data.prev || null,
    data,
  };
}
