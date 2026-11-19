// Currently Learning POC — pure helpers + device (logged-out) history storage.
// History items are newest first: {ref, he_ref, book, versions, language, time_stamp (epoch secs)}.

export const ANON_HISTORY_KEY = 'sefaria.anonHistory';
// Mirrors HISTORY_COALESCE_SECONDS in sefaria/model/user_profile.py.
export const COALESCE_SECONDS = 60;
export const MAX_ANON_ITEMS = 300;

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (e) {
    return null;
  }
};

export function readAnonHistory() {
  const ls = storage();
  if (!ls) return [];
  try {
    const items = JSON.parse(ls.getItem(ANON_HISTORY_KEY) || '[]');
    return Array.isArray(items) ? items : [];
  } catch (e) {
    return [];
  }
}

export function writeAnonHistory(items) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(ANON_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_ANON_ITEMS)));
  } catch (e) {
    // Quota or privacy mode — device history is best effort.
  }
}

export function clearAnonHistory() {
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(ANON_HISTORY_KEY);
  } catch (e) {
    // ignore
  }
}

// Adds `item` to the front of `items`. If the newest item is the same book and was read within
// `coalesceSeconds`, it is replaced instead (one entry per "dwell"), matching the server.
export function addHistoryItem(items, item, coalesceSeconds = COALESCE_SECONDS) {
  const [latest, ...rest] = items;
  if (
    latest &&
    latest.book === item.book &&
    item.time_stamp >= latest.time_stamp &&
    item.time_stamp - latest.time_stamp <= coalesceSeconds
  ) {
    return [item, ...rest];
  }
  return [item, ...items].slice(0, MAX_ANON_ITEMS);
}

// One entry per book (its most recent item), newest first. Sheets are excluded.
export function booksFromHistory(items) {
  const seen = new Set();
  const books = [];
  for (const item of items) {
    if (!item || !item.book || item.book === 'Sheet' || item.secondary || seen.has(item.book)) continue;
    seen.add(item.book);
    books.push(item);
  }
  return books;
}

export function visitsForBook(items, book) {
  return items.filter((x) => x.book === book && !x.secondary);
}

// Pinned books first (in `pinnedBooks` order, i.e. newest pin first), then the rest by recency.
export function orderWithPins(books, pinnedBooks = []) {
  const byBook = new Map(books.map((b) => [b.book, b]));
  const pinned = pinnedBooks.filter((b) => byBook.has(b)).map((b) => ({ ...byBook.get(b), pinned: true }));
  const rest = books.filter((b) => !pinnedBooks.includes(b.book)).map((b) => ({ ...b, pinned: false }));
  return pinned.concat(rest);
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Returns 'today' | 'yesterday' | null (older) for an epoch-seconds timestamp.
export function relativeDay(timeStamp, now = new Date()) {
  const day = startOfDay(new Date(timeStamp * 1000));
  const today = startOfDay(now);
  if (day === today) return 'today';
  if (day === today - 86400000) return 'yesterday';
  return null;
}

// Groups visits (newest first) by calendar day: [{dayStart, timeStamp, visits: [...]}].
export function groupVisitsByDay(visits) {
  const groups = [];
  for (const v of visits) {
    const dayStart = startOfDay(new Date(v.time_stamp * 1000));
    let group = groups[groups.length - 1];
    if (!group || group.dayStart !== dayStart) {
      group = { dayStart, timeStamp: v.time_stamp, visits: [] };
      groups.push(group);
    }
    group.visits.push(v);
  }
  return groups;
}

// ---- Welcome back (returning to a book somewhere other than your saved place) ----
export const WELCOME_BACK_KEY = 'sefaria.welcomeBackDismissed';
export const WELCOME_BACK_MIN_AGE_SECONDS = 30 * 60; // only for a new visit, not a reload mid-session
export const WELCOME_BACK_MAX_DISMISSALS = 2; // "Stay here" twice for a book → stop offering for that book

export function welcomeBackDismissals() {
  const ls = storage();
  if (!ls) return {};
  try {
    return JSON.parse(ls.getItem(WELCOME_BACK_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

export function recordWelcomeBackDismissal(book) {
  const ls = storage();
  if (!ls) return;
  const d = welcomeBackDismissals();
  d[book] = (d[book] || 0) + 1;
  try {
    ls.setItem(WELCOME_BACK_KEY, JSON.stringify(d));
  } catch (e) {
    // ignore
  }
}

// `saved` is the book's saved place; section refs are compared so landing anywhere in the saved
// section counts as "already there".
export function shouldWelcomeBack({ saved, savedSection, landedSection, nowSeconds, dismissals = {} }) {
  if (!saved || !saved.ref || !savedSection || !landedSection) return false;
  if (saved.book === 'Sheet') return false;
  if (savedSection === landedSection) return false;
  if (nowSeconds - (saved.time_stamp || 0) < WELCOME_BACK_MIN_AGE_SECONDS) return false;
  if ((dismissals[saved.book] || 0) >= WELCOME_BACK_MAX_DISMISSALS) return false;
  return true;
}

// ---- First visit (one-time "we're saving your place" prompt, once per device) ----
export const FIRST_VISIT_KEY = 'sefaria.firstVisitShown';
export const FIRST_VISIT_MIN_REFS = 5; // distinct verses/segments read this visit
export const FIRST_VISIT_MIN_SECONDS = 60; // or this long reading a text

export function firstVisitShown() {
  const ls = storage();
  if (!ls) return true; // can't remember it was shown, so never show it
  try {
    return !!ls.getItem(FIRST_VISIT_KEY);
  } catch (e) {
    return true;
  }
}

export function markFirstVisitShown() {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(FIRST_VISIT_KEY, String(Math.floor(Date.now() / 1000)));
  } catch (e) {
    // ignore
  }
}

export function shouldShowFirstVisit({ shown, blocked, distinctRefs, secondsReading }) {
  if (shown || blocked) return false;
  return distinctRefs >= FIRST_VISIT_MIN_REFS || secondsReading >= FIRST_VISIT_MIN_SECONDS;
}
