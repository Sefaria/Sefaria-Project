/**
 * Browse data helpers: thin hooks over the existing data layer (`Sefaria.toc`, `getIndexDetails`,
 * `getVersions`, `updateCalendars`) plus pure shaping functions and the collection actions the
 * browse pages share (add to plan / lesson / shelf). Pure functions here are jest-tested.
 */
import { useEffect, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { createCollection } from '../store';
import { toast } from '../overlays';
import { t, lang } from '../i18n';
import { getPersona } from '../persona';
import { WHERE_TO_START } from './curated';

// ---- urls ------------------------------------------------------------------------------------

export const bookPath = (title) => `/${encodeURI(String(title).replace(/ /g, '_'))}`;
export const refPath = (ref) => `/${Sefaria.normRef(ref)}`;
export const categoryPath = (cats) => `/texts/${cats.map(encodeURIComponent).join('/')}`;
export const splitCategoryPath = (rest) => (rest || '').split('/').filter(Boolean).map(decodeURIComponent);

// ---- toc -------------------------------------------------------------------------------------

export const isCategory = (node) => !!node && 'category' in node;
export const topCategories = (toc = Sefaria.toc) => (toc || []).filter(c => isCategory(c) && !c.hidden);

/** Number of books (leaf titles) under a TOC node, recursively. */
export function countBooks(node) {
  if (!node) { return 0; }
  if (!isCategory(node)) { return 1; }
  return (node.contents || []).reduce((n, child) => n + countBooks(child), 0);
}

export const tocNode = (cats) => (cats.length ? Sefaria.tocObjectByCategories(cats) : null);

/** Split a category's contents into subcategories and books, keeping TOC order. */
export function splitContents(node) {
  const contents = (node && node.contents) || [];
  return {
    categories: contents.filter(c => isCategory(c) && !c.hidden),
    books: contents.filter(c => !isCategory(c) && !c.hidden),
  };
}

/** `{ en, he }` for a TOC node (category or book). */
export const nodeTitle = (node) => (isCategory(node)
  ? { en: node.category, he: node.heCategory || node.category }
  : { en: node.title, he: node.heTitle || node.title });

export const nodeShortDesc = (node) => ({ en: node.enShortDesc || '', he: node.heShortDesc || node.enShortDesc || '' });
export const nodeDesc = (node) => ({ en: node.enDesc || node.enShortDesc || '', he: node.heDesc || node.heShortDesc || node.enDesc || '' });

export const categoryColor = (cat) => Sefaria.palette.categoryColor(cat);
export const bookColor = (book) => categoryColor(book.primary_category || (book.categories && book.categories[0]) || 'Other');

export const whereToStart = (category) => WHERE_TO_START[category] || null;

// ---- refs ------------------------------------------------------------------------------------

/** The canonical index title a ref belongs to, or null. */
export function indexTitleOf(ref) {
  if (!ref) { return null; }
  const parsed = Sefaria.parseRef(ref);
  if (!parsed || parsed.error || !parsed.index) { return null; }
  const index = Sefaria.index(parsed.index);
  return index ? index.title : parsed.index;
}

/** The categories of a ref's book, or `[]`. */
export const refCategories = (ref) => Sefaria.refCategories(ref) || [];

export const refColor = (ref) => {
  const cats = refCategories(ref);
  return cats.length ? categoryColor(cats[0]) : categoryColor('Other');
};

// ---- recommendations and streak (pure) -------------------------------------------------------

/**
 * Sibling books of what the visitor has read: for each history ref, the books in the same
 * (deepest) TOC category that are not already in the history, in TOC order. `limit` results.
 */
export function recommendFromHistory(history, limit = 6) {
  const readTitles = new Set();
  const categoryKeys = [];
  for (const item of history || []) {
    const title = indexTitleOf(item.ref);
    if (!title) { continue; }
    readTitles.add(title);
    const index = Sefaria.index(title);
    const cats = index && index.categories ? index.categories : [];
    const key = cats.join('/');
    if (cats.length && !categoryKeys.includes(key)) { categoryKeys.push(key); }
  }
  const out = [];
  const seen = new Set();
  for (const key of categoryKeys) {
    const node = Sefaria.tocObjectByCategories(key.split('/'));
    for (const book of splitContents(node).books) {
      if (readTitles.has(book.title) || seen.has(book.title)) { continue; }
      seen.add(book.title);
      out.push(book);
      if (out.length >= limit) { return out; }
    }
  }
  return out;
}

const dayKey = (d) => d.toISOString().slice(0, 10);

/** Consecutive days (YYYY-MM-DD strings) ending today or yesterday. */
export function computeStreak(dates, today = new Date()) {
  const set = new Set((dates || []).filter(Boolean));
  if (!set.size) { return 0; }
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!set.has(dayKey(cursor))) { cursor.setUTCDate(cursor.getUTCDate() - 1); }
  let n = 0;
  while (set.has(dayKey(cursor))) { n += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return n;
}

/** Group shelf items by tag → `[{ tag, items }]`, most items first; untagged items are skipped. */
export function groupByTag(items) {
  const groups = new Map();
  for (const item of items || []) {
    for (const tag of item.tags || []) {
      if (!groups.has(tag)) { groups.set(tag, []); }
      groups.get(tag).push(item);
    }
  }
  return Array.from(groups, ([tag, list]) => ({ tag, items: list })).sort((a, b) => b.items.length - a.items.length);
}

// ---- collections -----------------------------------------------------------------------------

export const collections = {
  history: () => createCollection('history', { version: 1 }),
  shelf: () => createCollection('shelf', { version: 1 }),
  plans: () => createCollection('plans', { version: 1 }),
  lessons: () => createCollection('lessons', { version: 1 }),
  notebook: () => createCollection('notebook', { version: 1 }),
  streak: () => createCollection('streak', { version: 1 }),
};

/** Add a `{ ref, title }` to the newest study plan (creating one when there is none). */
export function addToPlan(source) {
  const plans = collections.plans();
  const latest = plans.list()[0];
  const plan = latest || { title: t('plan.untitled'), items: [] };
  const items = (plan.items || []).filter(i => i.ref !== source.ref).concat([{ ref: source.ref, title: source.title || source.ref }]);
  const stored = plans.put({ ...plan, items, ts: Date.now() });
  toast(t('act.addedToPlan'));
  return stored;
}

/** Add a `{ ref, title }` source to the newest lesson (creating one when there is none). */
export function addToLesson(source) {
  const lessons = collections.lessons();
  const latest = lessons.list()[0];
  const lesson = latest || { title: t('lesson.untitled'), sources: [], questions: [], handoutNotes: '' };
  const sources = (lesson.sources || []).filter(s => s.ref !== source.ref).concat([{ ref: source.ref, title: source.title || source.ref }]);
  const stored = lessons.put({ ...lesson, sources, ts: Date.now() });
  toast(t('act.addedToLesson', { title: stored.title }));
  return stored;
}

/** Save a `{ ref, title, tags }` to the shelf once; returns the stored item (existing or new). */
export function saveToShelf(source) {
  const shelf = collections.shelf();
  const existing = shelf.list().find(i => i.ref === source.ref);
  if (existing) { toast(t('act.onShelf')); return existing; }
  const stored = shelf.put({ ref: source.ref, title: source.title || source.ref, tags: source.tags || [] });
  toast(t('act.savedToShelf'));
  return stored;
}

export const isOnShelf = (ref) => collections.shelf().list().some(i => i.ref === ref);

/** Follow a learning schedule: one plan per calendar title, with a (simulated) reminder flag. */
export function followCalendar(item) {
  const plans = collections.plans();
  const existing = plans.list().find(p => p.calendar === item.title.en);
  if (existing) { return existing; }
  const stored = plans.put({
    title: item.title.en, titleHe: item.title.he, calendar: item.title.en, reminder: true,
    items: item.ref ? [{ ref: item.ref, title: item.displayValue.en }] : [],
  });
  toast(t('cal.followed', { title: item.title[lang] || item.title.en }));
  return stored;
}

export const followedCalendar = (titleEn) => collections.plans().list().find(p => p.calendar === titleEn) || null;

export function setCalendarReminder(plan, on) {
  return collections.plans().put({ ...plan, reminder: !!on, ts: plan.ts });
}

/** The most recent history item for a book, or null. */
export const lastReadIn = (title) => (collections.history().list().find(h => indexTitleOf(h.ref) === title) || null);

export const recordHistory = (ref, title) => collections.history().put({ ref, title: title || indexTitleOf(ref) || ref, persona: getPersona() });

// ---- hooks over the data layer ---------------------------------------------------------------

/** `{ data, error, loading }` for `Sefaria.getIndexDetails(title)`. */
export function useIndexDetails(title) {
  const [state, setState] = useState(() => ({ data: title ? Sefaria.getIndexDetailsFromCache(title) : null, error: null }));
  useEffect(() => {
    let alive = true;
    if (!title) { return undefined; }
    const cached = Sefaria.getIndexDetailsFromCache(title);
    if (cached) { setState({ data: cached, error: null }); return undefined; }
    setState({ data: null, error: null });
    Promise.resolve(Sefaria.getIndexDetails(title))
      .then(data => { if (alive) { setState({ data: data && !data.error ? data : null, error: data && data.error ? data.error : null }); } })
      .catch(err => { if (alive) { setState({ data: null, error: err }); } });
    return () => { alive = false; };
  }, [title]);
  return { ...state, loading: !state.data && !state.error };
}

/** Versions of a book by language (`Sefaria.getVersions`); `null` while loading. */
export function useVersions(title) {
  const [versions, setVersions] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!title) { return undefined; }
    setVersions(null);
    Promise.resolve(Sefaria.getVersions(title))
      .then(v => { if (alive) { setVersions(v || {}); } })
      .catch(() => { if (alive) { setVersions({}); } });
    return () => { alive = false; };
  }, [title]);
  return versions;
}

/**
 * Today's learning schedules (`/api/calendars`): `{ items, error, loading }`. Uses what the
 * server already sent (`Sefaria.calendars`) when present, else `Sefaria.updateCalendars`.
 */
export function useCalendars() {
  const [state, setState] = useState(() => ({ items: Array.isArray(Sefaria.calendars) && Sefaria.calendars.length ? Sefaria.calendars : null, error: null }));
  useEffect(() => {
    if (state.items) { return undefined; }
    let alive = true;
    Promise.resolve(Sefaria.updateCalendars(Sefaria.textualCustom || 'ashkenazi', 1))
      .then(() => { if (alive) { setState({ items: Array.isArray(Sefaria.calendars) ? Sefaria.calendars : [], error: null }); } })
      .catch(err => { if (alive) { setState({ items: null, error: err || true }); } });
    return () => { alive = false; };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  return { items: state.items, error: state.error, loading: !state.items && !state.error };
}

/** Calendars sorted by `order`, with the parasha-group first. */
export const sortCalendars = (items) => (items || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
export const findCalendar = (items, titleEn) => (items || []).find(i => i.title && i.title.en === titleEn) || null;
