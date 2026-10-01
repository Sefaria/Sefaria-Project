/**
 * The hub's only contact with the data layer (`static/js/sefaria/sefaria.js`): text previews,
 * index records for plans, learning calendars, title suggestions and ref URLs. Pages import
 * from here, so tests mock one module.
 */
import Sefaria from '../../sefaria/sefaria';

const strip = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const flatten = (x) => (Array.isArray(x) ? x.flat(Infinity).filter(Boolean).join(' ') : (x || ''));
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

/** `/Genesis.1.1` for `Genesis 1:1` (the reader route). */
export function refUrl(ref) {
  try { return `/${Sefaria.normRef(ref)}`; } catch (e) { return `/${String(ref).replace(/ /g, '_')}`; }
}

export function categoryColor(category) {
  try { return category && Sefaria.palette ? Sefaria.palette.categoryColor(category) : undefined; } catch (e) { return undefined; }
}

/**
 * The text at `ref` for previews and handouts: `{ ref, heRef, he, en, category, indexTitle,
 * versionTitle, heVersionTitle, versions: [{ title, lang }] }`. Rejects when the ref is unknown.
 */
export async function fetchPreview(ref, { maxChars = 1500 } = {}) {
  const d = await Sefaria.getText(ref, { context: 0 });
  if (!d || d.error) { throw new Error((d && d.error) || 'Not found'); }
  return {
    ref: d.ref || ref,
    heRef: d.heRef || '',
    he: truncate(strip(flatten(d.he)), maxChars),
    en: truncate(strip(flatten(d.text)), maxChars),
    category: d.primary_category || (d.categories || [])[0] || '',
    indexTitle: d.indexTitle || d.book || '',
    versionTitle: d.versionTitle || '',
    heVersionTitle: d.heVersionTitle || '',
    versions: (d.versions || []).map(v => ({ title: v.versionTitle, lang: v.language })).filter(v => v.title),
  };
}

/** `/api/v2/index/<title>` (schema, lengths, titles). Rejects for unknown titles. */
export async function fetchIndex(title) {
  const d = await Sefaria.getIndexDetails(title);
  if (!d || d.error || !d.schema) { throw new Error((d && d.error) || 'Unknown book'); }
  return d;
}

/** Today's learning calendars (`[{ title: {en,he}, displayValue: {en,he}, ref, url, category }]`), cached on `Sefaria.calendars`. */
export async function fetchCalendars() {
  if (Array.isArray(Sefaria.calendars) && Sefaria.calendars.length) { return Sefaria.calendars; }
  const d = await Sefaria._ApiPromise(`${Sefaria.apiHost}/api/calendars`);
  Sefaria.calendars = (d && d.calendar_items) || [];
  return Sefaria.calendars;
}

/** Book-title suggestions for a partial title: `[{ title, key }]` (key is the index title). */
export async function suggestBooks(q) {
  if (!q || q.length < 2) { return []; }
  try {
    const d = await Sefaria.getName(q, 8);
    return (d.completion_objects || []).filter(o => o.type === 'ref').map(o => ({ title: o.title, key: o.key }));
  } catch (e) {
    return [];
  }
}
