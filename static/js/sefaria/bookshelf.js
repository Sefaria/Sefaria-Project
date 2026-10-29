/**
 * Bookshelf POC: books a reader keeps on the homepage, with where they left off.
 *
 * Logged in: the list lives on the user profile (`Sefaria.bookshelf`, saved via /api/profile),
 * and "where you left off" comes from `Sefaria.last_place`.
 * Anonymous: one book, kept with its last ref in localStorage.
 *
 * Components subscribe to changes, promos and toasts through `subscribe()`.
 */
import Sefaria from './sefaria';

const ANON_KEY = 'bookshelf_anon';              // {book, lastRef, added}
const OPENS_KEY = 'bookshelf_opens';            // {book: number of times opened}
const PROMOTED_KEY = 'bookshelf_promoted';      // [book] promo already shown
const ANIMATED_KEY = 'bookshelf_promo_animated'; // promo animation already shown once
const PENDING_KEY = 'bookshelf_pending';        // book to add after sign up / log in

const MAX_HOME_BOOKS = 6;

const storage = {
  get(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
  },
};

const listeners = new Set();
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = (type, payload) => listeners.forEach(fn => fn(type, payload));

const isLoggedIn = () => !!Sefaria._uid;
const anonItem = () => storage.get(ANON_KEY, null);

const getBooks = () => {
  if (isLoggedIn()) {
    return (Sefaria.bookshelf || []).map(x => x.book);
  }
  const item = anonItem();
  return item ? [item.book] : [];
};
const has = (book) => getBooks().includes(book);
const isAnonFull = () => !isLoggedIn() && !!anonItem();

const _saveProfileShelf = (shelf) => {
  Sefaria.bookshelf = shelf;
  return Sefaria.editProfileAPI({bookshelf: shelf});
};

/**
 * Add `book`. Rejects with 'full' when an anonymous reader already has a book.
 * `source` is 'star' or 'promo'; it decides the toast's second line.
 */
const add = (book, source = 'star') => {
  if (has(book)) { return Promise.resolve(); }
  if (isLoggedIn()) {
    const shelf = [{book, added: Sefaria.util.epoch_time()}].concat(Sefaria.bookshelf || []);
    emit('change');
    emit('toast', {book, source});
    return _saveProfileShelf(shelf);
  }
  if (isAnonFull()) {
    return Promise.reject('full');
  }
  const lastPlace = Sefaria.lastPlaceForText(book);
  storage.set(ANON_KEY, {book, lastRef: lastPlace ? lastPlace.ref : null, added: Sefaria.util.epoch_time()});
  emit('change');
  emit('toast', {book, source});
  return Promise.resolve();
};

const remove = (book) => {
  if (!has(book)) { return Promise.resolve(); }
  let saving = Promise.resolve();
  if (isLoggedIn()) {
    saving = _saveProfileShelf((Sefaria.bookshelf || []).filter(x => x.book !== book));
  } else {
    storage.remove(ANON_KEY);
  }
  emit('change');
  emit('toast', {book, removed: true});
  return saving;
};

const toggle = (book) => has(book) ? remove(book) : add(book, 'star');

/** Remember a book to add once the reader signs up or logs in. */
const setPending = (book) => storage.set(PENDING_KEY, book);

/** The ref to send the reader back to for `book`, or null. */
const lastRef = (book) => {
  if (!isLoggedIn()) {
    const item = anonItem();
    if (item && item.book === book && item.lastRef) { return item.lastRef; }
  }
  const lastPlace = Sefaria.lastPlaceForText(book);
  return lastPlace ? lastPlace.ref : null;
};

const homeBooks = () => getBooks().slice(0, MAX_HOME_BOOKS);

/**
 * Shorten a stored ref for display: the start of a range, and the daf only for Talmud
 * ("Berakhot 12b:3-5" -> "Berakhot 12b").
 */
const formatRef = (ref, isTalmud) => {
  if (!ref) { return ref; }
  let display = ref.replace(/-.*$/, '');
  if (isTalmud) {
    display = display.replace(/:\d+$/, '');
  }
  return display;
};

const isTalmud = (book) => {
  const index = Sefaria.index(book);
  return !!index && !!index.categories && index.categories[0] === 'Talmud';
};

/** Called with every history item the reader saves; keeps the anonymous book's place current. */
const noteHistory = (item) => {
  if (isLoggedIn() || !item || item.secondary) { return; }
  const anon = anonItem();
  if (anon && anon.book === item.book) {
    storage.set(ANON_KEY, {...anon, lastRef: item.ref});
  }
};

/**
 * Called each time a book is opened. On the second open of a book that isn't on the shelf,
 * shows the promo once for that book.
 */
const noteBookOpened = (book) => {
  if (!book) { return; }
  const opens = storage.get(OPENS_KEY, {});
  opens[book] = (opens[book] || 0) + 1;
  storage.set(OPENS_KEY, opens);

  const promoted = storage.get(PROMOTED_KEY, []);
  if (opens[book] < 2 || has(book) || promoted.includes(book)) { return; }
  storage.set(PROMOTED_KEY, promoted.concat([book]));

  const variant = isAnonFull() ? 'signup' : 'add';
  const animate = variant === 'add' && !storage.get(ANIMATED_KEY, false);
  if (animate) { storage.set(ANIMATED_KEY, true); }
  queuedPromo = {book, variant, animate};
  emit('promo', queuedPromo);
};

// The promo can fire on page load before the overlay has subscribed, so it waits here until taken.
let queuedPromo = null;
/** Show the sign-up wall for an anonymous reader who tries to add a second book. */
const showLimit = (book) => {
  setPending(book);
  queuedPromo = {book, variant: 'limit', animate: false};
  emit('promo', queuedPromo);
};
const takePromo = () => {
  const promo = queuedPromo;
  queuedPromo = null;
  return promo;
};

/**
 * On a logged-in page, move the anonymous book and any pending book into the account.
 */
const mergeAfterLogin = () => {
  if (!isLoggedIn()) { return; }
  const anon = anonItem();
  const pending = storage.get(PENDING_KEY, null);
  const incoming = [pending, anon && anon.book].filter(book => book && !has(book));
  storage.remove(ANON_KEY);
  storage.remove(PENDING_KEY);
  if (!incoming.length) { return; }
  const now = Sefaria.util.epoch_time();
  const shelf = incoming.map(book => ({book, added: now})).concat(Sefaria.bookshelf || []);
  _saveProfileShelf(shelf);
  emit('change');
};

const Bookshelf = {
  subscribe,
  getBooks,
  homeBooks,
  has,
  isAnonFull,
  add,
  remove,
  toggle,
  setPending,
  lastRef,
  formatRef,
  isTalmud,
  noteHistory,
  noteBookOpened,
  takePromo,
  showLimit,
  mergeAfterLogin,
};

export default Bookshelf;
