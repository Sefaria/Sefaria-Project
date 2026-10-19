/**
 * The shared localStorage collections of Library Next and the typed factories that write them.
 * `my-library` owns these schemas; every other feature imports from here instead of calling
 * `createCollection` with its own field names. Documented in docs/library-next/COLLECTIONS.md.
 *
 *   import { addHistory, saveToShelf, addNote, addHighlight, addFlashcard, markStreakToday } from '../my/collections';
 *   addHistory('Genesis 1:1', 'Genesis 1:1', { heTitle: 'בראשית א׳:א׳' });
 *
 * Every factory validates its arguments (TypeError on bad input), fills defaults, and returns the
 * stored item (`{ id, ts, ... }`). Collections are versioned; a shape change bumps `version` and
 * extends `migrate` in SCHEMAS. Field names follow PLAN.md.
 */
import { createCollection, kv } from '../store';
import { getPersona, isPersona } from '../persona';
import { dayKey, addDays, daysBetween, isValidDayKey } from './dates';

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'];
export const HISTORY_PAUSED_KEY = 'historyPaused';
export const LAST_SYNC_KEY = 'lastSync';

/** Fill missing fields with the schema defaults; the default `migrate` for every collection. */
const withDefaults = (defaults) => (items) => {
  const out = {};
  for (const [id, item] of Object.entries(items || {})) {
    out[id] = { ...defaults, ...item, id: item.id || id };
  }
  return out;
};

/** plans v1 → v2: `items[{ref,title}]` → `units`, `titleHe` → `heTitle`, `reminder` → `reminders`, a `startDate`. */
function migratePlans(items) {
  const out = withDefaults(SCHEMAS.plans.defaults)(items);
  for (const plan of Object.values(out)) {
    if (!plan.units.length && Array.isArray(plan.items)) {
      plan.units = plan.items.filter(i => i && typeof i.ref === 'string' && i.ref).map(i => ({ ref: i.ref, label: i.title || i.ref, heLabel: i.heTitle || '' }));
    }
    if (!plan.heTitle && typeof plan.titleHe === 'string') { plan.heTitle = plan.titleHe; }
    if (plan.reminder !== undefined) { plan.reminders = plan.reminder === true; }
    if (!isValidDayKey(plan.startDate)) { plan.startDate = dayKey(new Date(plan.ts || Date.now())); }
    delete plan.items; delete plan.titleHe; delete plan.reminder;
  }
  return out;
}

/**
 * One entry per collection: `version`, `defaults` (also the field list), `migrate`. Field notes:
 *   history    ref, title, heTitle, book, ts, persona           one row per visit; same ref twice in a row updates ts
 *   shelf      ref, title, heTitle, kind ('ref'|'book'), tags[], ts   id = 'shelf:' + ref, so saving again merges tags
 *   notes      ref, text, title, heTitle, book, ts
 *   highlights ref, color, text, book, ts
 *   flashcards front, back, ref, due, interval, ease, reps, ts  SM-2 lite fields live on the card
 *   plans      title, heTitle, book, calendar, units[{ref,label,heLabel}], unitsPerDay, startDate, done[], reminders, ts
 *              (v2; v1 rows from browse's first "follow this schedule" used items/titleHe/reminder and are migrated)
 *   lessons    title, sources[{id,ref,title,heTitle,he,en,note}], questions[{id,en,he}], handoutNotes, ts
 *   notebook   ref, text, versions[], citation, title, heTitle, ts
 *   streak     id = date (YYYY-MM-DD), date, count, ts
 */
export const SCHEMAS = {
  history: { version: 1, defaults: { ref: '', title: '', heTitle: '', book: '', persona: 'newcomer' } },
  shelf: { version: 1, defaults: { ref: '', title: '', heTitle: '', kind: 'ref', tags: [] } },
  notes: { version: 1, defaults: { ref: '', text: '', title: '', heTitle: '', book: '' } },
  highlights: { version: 1, defaults: { ref: '', color: 'yellow', text: '', book: '' } },
  flashcards: { version: 1, defaults: { front: '', back: '', ref: '', due: 0, interval: 0, ease: 2.5, reps: 0 } },
  plans: { version: 2, defaults: { title: '', heTitle: '', book: '', calendar: '', units: [], unitsPerDay: 1, startDate: '', done: [], reminders: false }, migrate: migratePlans },
  lessons: { version: 1, defaults: { title: '', sources: [], questions: [], handoutNotes: '' } },
  notebook: { version: 1, defaults: { ref: '', text: '', versions: [], citation: '', title: '', heTitle: '' } },
  streak: { version: 1, defaults: { date: '', count: 1 } },
};
Object.values(SCHEMAS).forEach(s => { if (!s.migrate) { s.migrate = withDefaults(s.defaults); } });

export const COLLECTION_NAMES = Object.keys(SCHEMAS);

/** The collection instance for `name`, created with its schema version and migration. */
export function collection(name) {
  const schema = SCHEMAS[name];
  if (!schema) { throw new TypeError(`Unknown collection: ${name}`); }
  return createCollection(name, { version: schema.version, migrate: schema.migrate });
}

/** Options for `useCollection(name, options)` so hooks and factories agree on the version. */
export function collectionOptions(name) {
  const schema = SCHEMAS[name];
  return schema ? { version: schema.version, migrate: schema.migrate } : {};
}

// ---- validation ------------------------------------------------------------------------------

function str(value, name, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function optStr(value, name) {
  if (value === undefined || value === null) { return ''; }
  if (typeof value !== 'string') { throw new TypeError(`${name} must be a string`); }
  return value.trim();
}

function strList(value, name) {
  if (value === undefined || value === null) { return []; }
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) { throw new TypeError(`${name} must be a list of strings`); }
  return Array.from(new Set(value.map(v => v.trim()).filter(Boolean)));
}

function posInt(value, name, fallback) {
  if (value === undefined || value === null) { return fallback; }
  if (!Number.isInteger(value) || value < 1) { throw new TypeError(`${name} must be a positive integer`); }
  return value;
}

function id(value, name = 'id') {
  if (typeof value !== 'string' || !value) { throw new TypeError(`${name} is required`); }
  return value;
}

/** The book (index title) a ref belongs to, by stripping trailing section numbers. Good enough for grouping. */
export function bookOf(ref) {
  if (typeof ref !== 'string') { return ''; }
  return ref.replace(/[\s,]*\d[\d:ab\-–,.\s]*$/, '').trim() || ref.trim();
}

// ---- history + streak -----------------------------------------------------------------------

export function isHistoryPaused() {
  return kv.get(HISTORY_PAUSED_KEY, false) === true;
}

export function setHistoryPaused(paused) {
  kv.set(HISTORY_PAUSED_KEY, paused === true);
}

/**
 * Record a visit. Returns the stored row, or null while history is paused. A visit to the same
 * ref as the latest row only refreshes its timestamp. Also marks today on the streak.
 */
export function addHistory(ref, title, { heTitle, book, persona, ts } = {}) {
  ref = str(ref, 'ref');
  title = optStr(title, 'title') || ref;
  if (isHistoryPaused()) { return null; }
  const who = isPersona(persona) ? persona : getPersona();
  const col = collection('history');
  const latest = col.list()[0];
  const row = { ref, title, heTitle: optStr(heTitle, 'heTitle'), book: optStr(book, 'book') || bookOf(ref), persona: who, ts: ts || Date.now() };
  markStreakToday(new Date(row.ts));
  if (latest && latest.ref === ref) {   // a re-read: refresh, keeping what the caller did not repeat
    return col.put({ ...latest, ...row, heTitle: row.heTitle || latest.heTitle, book: row.book || latest.book, id: latest.id });
  }
  return col.put(row);
}

export function clearHistory() {
  collection('history').clear();
}

/** Mark a day (default today) as a reading day. Idempotent per day; repeated marks raise `count`. */
export function markStreakToday(date = new Date()) {
  const key = dayKey(date);
  if (!isValidDayKey(key)) { throw new TypeError('date must be a Date or YYYY-MM-DD'); }
  const col = collection('streak');
  const existing = col.get(key);
  return col.put({ id: key, date: key, count: existing ? existing.count + 1 : 1, ts: existing ? existing.ts : Date.now() });
}

/**
 * `{ current, longest, total, days }`: `current` counts back from today (or yesterday, when
 * today is not read yet); `days` maps `YYYY-MM-DD` → count.
 */
export function getStreak(today = new Date()) {
  const days = {};
  collection('streak').list().forEach(row => { if (row.date) { days[row.date] = row.count || 1; } });
  const keys = Object.keys(days).sort();
  let longest = 0, run = 0, prev = null;
  for (const key of keys) {
    run = prev && daysBetween(prev, key) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = key;
  }
  const todayKey = dayKey(today);
  let cursor = days[todayKey] ? todayKey : (days[addDays(todayKey, -1)] ? addDays(todayKey, -1) : null);
  let current = 0;
  while (cursor && days[cursor]) { current += 1; cursor = addDays(cursor, -1); }
  return { current, longest, total: keys.length, days };
}

// ---- shelf -------------------------------------------------------------------------------------

export const shelfId = (ref) => `shelf:${ref}`;

/** Save a ref or a book. Saving an existing ref merges its tags. `kind` is 'ref' or 'book'. */
export function saveToShelf({ ref, title, heTitle, kind = 'ref', tags = [] } = {}) {
  ref = str(ref, 'ref');
  if (kind !== 'ref' && kind !== 'book') { throw new TypeError("kind must be 'ref' or 'book'"); }
  const col = collection('shelf');
  const existing = col.get(shelfId(ref));
  return col.put({
    ...(existing || {}),
    id: shelfId(ref),
    ref,
    title: optStr(title, 'title') || (existing && existing.title) || ref,
    heTitle: optStr(heTitle, 'heTitle') || (existing && existing.heTitle) || '',
    kind,
    tags: strList([...(existing ? existing.tags : []), ...tags], 'tags'),
    ts: Date.now(),
  });
}

export function removeFromShelf(ref) {
  return collection('shelf').remove(shelfId(str(ref, 'ref')));
}

export function isOnShelf(ref) {
  return typeof ref === 'string' && collection('shelf').get(shelfId(ref)) !== null;
}

export function setShelfTags(ref, tags) {
  const col = collection('shelf');
  const existing = col.get(shelfId(str(ref, 'ref')));
  if (!existing) { return null; }
  return col.put({ ...existing, tags: strList(tags, 'tags') });
}

// ---- notes + highlights ---------------------------------------------------------------------

export function addNote(ref, text, { title, heTitle, book } = {}) {
  ref = str(ref, 'ref');
  return collection('notes').put({ ref, text: str(text, 'text'), title: optStr(title, 'title') || ref, heTitle: optStr(heTitle, 'heTitle'), book: optStr(book, 'book') || bookOf(ref) });
}

export function updateNote(noteId, text) {
  const col = collection('notes');
  const existing = col.get(id(noteId, 'noteId'));
  if (!existing) { return null; }
  return col.put({ ...existing, text: str(text, 'text') });
}

export function addHighlight(ref, color = 'yellow', { text, book } = {}) {
  ref = str(ref, 'ref');
  if (!HIGHLIGHT_COLORS.includes(color)) { throw new TypeError(`color must be one of ${HIGHLIGHT_COLORS.join(', ')}`); }
  return collection('highlights').put({ ref, color, text: optStr(text, 'text'), book: optStr(book, 'book') || bookOf(ref) });
}

// ---- flashcards --------------------------------------------------------------------------------

/** A new card is due now; `interval` (days), `ease` and `reps` are updated by the review session (sm2.js). */
export function addFlashcard(front, back, { ref, due } = {}) {
  return collection('flashcards').put({
    front: str(front, 'front'), back: str(back, 'back'), ref: optStr(ref, 'ref'),
    due: typeof due === 'number' ? due : Date.now(), interval: 0, ease: 2.5, reps: 0,
  });
}

export function updateFlashcard(cardId, patch) {
  const col = collection('flashcards');
  const existing = col.get(id(cardId, 'cardId'));
  if (!existing) { return null; }
  return col.put({ ...existing, ...patch, id: existing.id });
}

// ---- plans -------------------------------------------------------------------------------------

function unit(value) {
  if (!value || typeof value !== 'object') { throw new TypeError('a plan unit is { ref, label, heLabel }'); }
  const ref = str(value.ref, 'unit.ref');
  return { ref, label: optStr(value.label, 'unit.label') || ref, heLabel: optStr(value.heLabel, 'unit.heLabel') };
}

/**
 * A study plan over ordered `units` (refs), `unitsPerDay` per day from `startDate` (YYYY-MM-DD, default
 * today). `calendar` names the learning schedule a plan follows (browse's "Follow this schedule").
 */
export function createPlan({ title, heTitle, book, calendar, units = [], unitsPerDay = 1, startDate, reminders = false } = {}) {
  if (!Array.isArray(units)) { throw new TypeError('units must be a list'); }
  const start = startDate === undefined ? dayKey() : startDate;
  if (!isValidDayKey(start)) { throw new TypeError('startDate must be YYYY-MM-DD'); }
  return collection('plans').put({
    title: str(title, 'title'), heTitle: optStr(heTitle, 'heTitle'), book: optStr(book, 'book'), calendar: optStr(calendar, 'calendar'),
    units: units.map(unit), unitsPerDay: posInt(unitsPerDay, 'unitsPerDay', 1), startDate: start, done: [], reminders: reminders === true,
  });
}

export function addToPlan(planId, value) {
  const col = collection('plans');
  const existing = col.get(id(planId, 'planId'));
  if (!existing) { return null; }
  const next = unit(value);
  if (existing.units.some(u => u.ref === next.ref)) { return existing; }
  return col.put({ ...existing, units: [...existing.units, next] });
}

export function updatePlan(planId, patch) {
  const col = collection('plans');
  const existing = col.get(id(planId, 'planId'));
  if (!existing) { return null; }
  return col.put({ ...existing, ...patch, id: existing.id });
}

/** Toggle a unit's completion by ref. */
export function markPlanUnitDone(planId, ref, done = true) {
  const col = collection('plans');
  const existing = col.get(id(planId, 'planId'));
  if (!existing) { return null; }
  ref = str(ref, 'ref');
  const set = new Set(existing.done || []);
  if (done) { set.add(ref); } else { set.delete(ref); }
  return col.put({ ...existing, done: Array.from(set) });
}

// ---- lessons -----------------------------------------------------------------------------------

function newSubId() {
  return Math.random().toString(36).slice(2, 9);
}

function question(value) {
  if (typeof value === 'string') { const text = str(value, 'question'); return { id: newSubId(), en: text, he: text }; }
  if (!value || typeof value !== 'object') { throw new TypeError('a question is a string or { en, he }'); }
  const en = optStr(value.en, 'question.en'), he = optStr(value.he, 'question.he');
  if (!en && !he) { throw new TypeError('a question needs en or he text'); }
  return { id: value.id || newSubId(), en: en || he, he: he || en };
}

/** Lesson source text is plain: tags dropped, entities decoded (the handout prints it as text). */
const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', '#39': "'" }[e])).replace(/\s+/g, ' ').trim();

function source(value) {
  if (!value || typeof value !== 'object') { throw new TypeError('a source is { ref, title, heTitle, he, en, note }'); }
  const ref = str(value.ref, 'source.ref');
  return {
    id: value.id || newSubId(), ref, title: optStr(value.title, 'source.title') || ref, heTitle: optStr(value.heTitle, 'source.heTitle'),
    he: plain(optStr(value.he, 'source.he')), en: plain(optStr(value.en, 'source.en')), note: optStr(value.note, 'source.note'),
    category: optStr(value.category, 'source.category'),
  };
}

export function createLesson({ title, sources = [], questions = [], handoutNotes = '' } = {}) {
  if (!Array.isArray(sources) || !Array.isArray(questions)) { throw new TypeError('sources and questions must be lists'); }
  return collection('lessons').put({ title: str(title, 'title'), sources: sources.map(source), questions: questions.map(question), handoutNotes: optStr(handoutNotes, 'handoutNotes') });
}

export function updateLesson(lessonId, patch) {
  const col = collection('lessons');
  const existing = col.get(id(lessonId, 'lessonId'));
  if (!existing) { return null; }
  const next = { ...existing, ...patch, id: existing.id };
  if (patch.title !== undefined) { next.title = str(patch.title, 'title'); }
  if (patch.sources) { next.sources = patch.sources.map(source); }
  if (patch.questions) { next.questions = patch.questions.map(question); }
  if (patch.handoutNotes !== undefined) { next.handoutNotes = optStr(patch.handoutNotes, 'handoutNotes'); }
  return col.put(next);
}

export function addSourceToLesson(lessonId, value) {
  const existing = collection('lessons').get(id(lessonId, 'lessonId'));
  if (!existing) { return null; }
  return updateLesson(lessonId, { sources: [...existing.sources, source(value)] });
}

export function addQuestion(lessonId, value) {
  const existing = collection('lessons').get(id(lessonId, 'lessonId'));
  if (!existing) { return null; }
  return updateLesson(lessonId, { questions: [...existing.questions, question(value)] });
}

/** Six characters, stable per lesson; shown as a simulated class code. */
export function classCode(lessonId) {
  let h = 0;
  for (const ch of String(lessonId)) { h = (h * 31 + ch.charCodeAt(0)) >>> 0; }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) { out += alphabet[h % alphabet.length]; h = Math.floor(h / alphabet.length) + i * 7; }
  return out;
}

// ---- notebook ----------------------------------------------------------------------------------

/** A URL-style citation for a ref and (optional) version; the scholar notebook's default. */
export function citationFor(ref, { versionTitle, accessed = new Date() } = {}) {
  ref = str(ref, 'ref');
  const url = `https://www.sefaria.org/${ref.replace(/ /g, '_').replace(/:/g, '.')}`;
  const version = optStr(versionTitle, 'versionTitle');
  return `${ref}${version ? `, ${version}` : ''}. Sefaria. ${url} (accessed ${dayKey(accessed)}).`;
}

export function addNotebookEntry({ ref, text, versions = [], citation, title, heTitle } = {}) {
  ref = str(ref, 'ref');
  return collection('notebook').put({
    ref, text: optStr(text, 'text'), versions: strList(versions, 'versions'),
    citation: optStr(citation, 'citation') || citationFor(ref), title: optStr(title, 'title') || ref, heTitle: optStr(heTitle, 'heTitle'),
  });
}

export function updateNotebookEntry(entryId, patch) {
  const col = collection('notebook');
  const existing = col.get(id(entryId, 'entryId'));
  if (!existing) { return null; }
  const next = { ...existing, ...patch, id: existing.id };
  if (patch.versions) { next.versions = strList(patch.versions, 'versions'); }
  return col.put(next);
}

// ---- counts ------------------------------------------------------------------------------------

/** `{ history: n, shelf: n, ... }` for every collection. */
export function counts() {
  const out = {};
  COLLECTION_NAMES.forEach(name => { out[name] = collection(name).list().length; });
  return out;
}
