/**
 * What kind of text is this? From the book's categories and section names:
 * verse | mishnah | sugya | comment | midrash | halakhah | liturgy | thought | other.
 * Era codes from /api/v2/index (`era`) map to the labelled periods in strings.js.
 */
export const KINDS = ['verse', 'mishnah', 'sugya', 'comment', 'midrash', 'halakhah', 'liturgy', 'thought', 'other'];
export const ERAS = ['T', 'A', 'GN', 'RI', 'AH', 'CO'];

export function textKind(book = {}) {
  const cats = book.categories || [];
  const names = (book.data && book.data.sectionNames) || [];
  const has = c => cats.includes(c);
  if (has('Commentary') || names.includes('Comment')) { return 'comment'; }
  if (has('Tanakh') || has('Targum')) { return 'verse'; }
  if (has('Mishnah') || has('Tosefta') || names.includes('Mishnah')) { return 'mishnah'; }
  if (has('Talmud') || names.includes('Daf')) { return 'sugya'; }
  if (has('Midrash')) { return 'midrash'; }
  if (has('Halakhah') || names.includes('Siman') || names.includes('Halakhah')) { return 'halakhah'; }
  if (has('Liturgy')) { return 'liturgy'; }
  if (has('Jewish Thought') || has('Kabbalah') || has('Chasidut') || has('Musar')) { return 'thought'; }
  return 'other';
}

/** `{ en, he }` texts from an index-details response, or empty strings. */
export function bookDescription(details) {
  if (!details) { return { en: '', he: '' }; }
  return { en: details.enDesc || details.enShortDesc || '', he: details.heDesc || details.heShortDesc || details.enDesc || details.enShortDesc || '' };
}

export function eraCode(details) {
  return details && ERAS.includes(details.era) ? details.era : null;
}

/** The authors of an index as `[{ en, he, slug }]`. */
export function authorsOf(details) {
  return ((details && details.authors) || []).map(a => { const en = a.en || a.slug || ''; return { en, he: a.he || en, slug: a.slug || '' }; }).filter(a => a.en);
}
