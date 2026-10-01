/**
 * Citation formats and selection exports for the scholar "Cite / export" tool. Chicago reuses the
 * reader's `citation()`; MLA and BibTeX are built here. Exports take the selection's segments as
 * rows for JSON / CSV. Pure; jest-covered.
 */
import { citation, canonicalUrl, plainText, stripHebrewMarks } from '../../reader/textData';
import { csvEscape } from '../../my/exportFormats';

export const CITE_STYLES = ['chicago', 'mla', 'bibtex'];

const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

export function isoDay(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function mlaDate(date, lang) {
  if (lang === 'he') { return new Date(date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' }); }
  const d = new Date(date);
  return `${d.getDate()} ${MLA_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** A BibTeX key: `Genesis_1_1` / `Berakhot_2a_1`. */
export function bibKey(ref) {
  return String(ref || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sefaria';
}

const bibEscape = s => String(s || '').replace(/([{}])/g, '\\$1');

/**
 * One citation. `style`: chicago | mla | bibtex. `ref`, `book` (index title), `versionTitle`
 * (what the reader renders), `date` (access date), `lang` (interface language for date words).
 */
export function formatCitation({ ref, book, versionTitle = '', style = 'chicago', date = new Date(), lang = 'en', accessedWord = 'accessed' }) {
  const url = canonicalUrl(ref);
  if (style === 'mla') {
    return `"${ref}." ${versionTitle ? `${versionTitle}. ` : ''}Sefaria, ${url.replace(/^https?:\/\//, '')}. ${lang === 'he' ? 'אוחזר' : 'Accessed'} ${mlaDate(date, lang)}.`;
  }
  if (style === 'bibtex') {
    const d = new Date(date);
    return [
      `@misc{${bibKey(ref)},`,
      `  title = {${bibEscape(ref)}},`,
      book && book !== ref ? `  booktitle = {${bibEscape(book)}},` : null,
      versionTitle ? `  note = {${bibEscape(versionTitle)}},` : null,
      '  publisher = {Sefaria},',
      `  howpublished = {\\url{${url}}},`,
      `  year = {${d.getFullYear()}},`,
      `  urldate = {${isoDay(d)}}`,
      '}',
    ].filter(Boolean).join('\n');
  }
  return citation({ ref, book, versionTitle, style: 'chicago', lang, date, accessedWord });
}

/** One row per selected segment, for JSON / CSV export. */
export function selectionRows(selection, book, { vowels = true, cantillation = true } = {}) {
  return (selection.segments || []).map(s => ({
    ref: s.ref,
    heRef: s.heRef,
    he: plainText(stripHebrewMarks(s.he, { vowels, cantillation })),
    en: plainText(s.en),
    book: book.title || '',
    heBook: book.heTitle || '',
    category: book.primaryCategory || '',
    versionTitle: book.versionTitle || '',
    heVersionTitle: book.heVersionTitle || '',
    url: canonicalUrl(s.ref),
  }));
}

export function rowsToCSV(rows) {
  const header = ['ref', 'heRef', 'he', 'en', 'book', 'heBook', 'category', 'versionTitle', 'heVersionTitle', 'url'];
  return [header.join(','), ...rows.map(r => header.map(k => csvEscape(r[k])).join(','))].join('\n') + '\n';
}

export function rowsToJSON(rows, { ref, citation: cite = '' } = {}) {
  return JSON.stringify({ format: 'sefaria.libnext.selection', ref, exportedAt: new Date().toISOString(), citation: cite, segments: rows }, null, 2);
}

/** A file-name stem for a ref: `Genesis_1_1-5`. */
export function fileStem(ref) {
  return String(ref || 'selection').replace(/[^A-Za-z0-9֐-׿-]+/g, '_').replace(/^_+|_+$/g, '');
}
