// Nusach (prayer rite) logic for the three siddurim in the Siddur Nusach POC.
// Pure functions plus guarded localStorage helpers; no dependency on the Sefaria singleton,
// so everything here is Jest-testable and safe to import during SSR.
import NUSACH_MAP from './siddurNusachMap.json';

export const NUSACHIM = ["ashkenaz", "sfard", "edot"];

// Built offline from the Sefaria API; see the Siddur Nusach wiki page. Refs are "Book, Node, Leaf" or "... Leaf N" (paragraph N).
export const NUSACH_BOOKS = NUSACH_MAP.books;

// Edot's default merged English includes a Portuguese version tagged as English, so pin a real English one.
const PINNED_ENGLISH_VERSIONS = {edot: "Sefaria Community Translation"};

export const SERVICES = ["shacharit", "mincha", "arvit"];

export const isNusach = n => NUSACHIM.includes(n);

export function nusachForBook(title, books = NUSACH_BOOKS) {
  return NUSACHIM.find(n => books[n].title === title) || null;
}

export const isSiddurBook = (title, books = NUSACH_BOOKS) => !!nusachForBook(title, books);

export function defaultNusach({countryCode, interfaceLang} = {}) {
  // Israel (by IP) or the Hebrew site (org.il) defaults to Edot HaMizrach; everywhere else to Ashkenaz.
  const inIsrael = (countryCode || "").toLowerCase() === "il";
  return inIsrael || interfaceLang === "hebrew" ? "edot" : "ashkenaz";
}

export function serviceForHour(hour) {
  // Weekday service by local hour: before noon Shacharit, before 19:00 Mincha, otherwise Arvit.
  return hour < 12 ? "shacharit" : hour < 19 ? "mincha" : "arvit";
}

export function serviceStartRef(nusach, service, books = NUSACH_BOOKS) {
  const book = books[nusach];
  if (!book) { return null; }
  return (book.services && book.services[service]) || book.title;
}

export const timeOfDayRef = (nusach, date = new Date(), books = NUSACH_BOOKS) =>
    serviceStartRef(nusach, serviceForHour(date.getHours()), books);

export function siddurContentLang(interfaceLang, nusach, books = NUSACH_BOOKS) {
  // Hebrew on the Hebrew site (org.il), English on .org unless the book has no English.
  const book = books[nusach];
  return interfaceLang === "hebrew" || (book && book.hasEnglish === false) ? "he" : "en";
}

export function siddurVersions(nusach) {
  const versionTitle = PINNED_ENGLISH_VERSIONS[nusach];
  return {en: versionTitle ? {languageFamilyName: "english", versionTitle} : null, he: null};
}

// Some Sefard node titles end in a space ("Motzaei Shabbat , Havdala"); compare refs without it.
export const normalizeSiddurRef = ref => (ref || "").replace(/_/g, " ").replace(/\s+/g, " ").replace(/ ,/g, ",").trim();

export function parseSiddurRef(ref) {
  // "Siddur Sefard, Weekday Mincha, Amidah 3-5" -> {path: "Siddur Sefard, Weekday Mincha, Amidah", segment: 3}.
  // These books are depth-1 leaves, so any trailing number (or range) is a paragraph.
  const m = normalizeSiddurRef(ref).match(/^(.*?)(?: (\d+)(?:-\d+)?)?$/);
  return {path: m[1], segment: m[2] ? parseInt(m[2], 10) : null};
}

function findPosition(positions, path) {
  // The leaf itself, or the first leaf under a non-leaf node.
  const norm = positions.map(p => normalizeSiddurRef(p.ref));
  const i = norm.indexOf(path);
  return positions[i >= 0 ? i : norm.findIndex(ref => ref.startsWith(path + ", "))] || null;
}

function anchorAt(position, paragraph) {
  // Section key in effect at `paragraph` of a leaf: the last one starting at or before it.
  let key = position.anchor;
  (position.segAnchors || []).forEach(([p, k]) => { if (p <= paragraph) { key = k; } });
  return key;
}

export function mapRefToNusach(ref, target, {map = NUSACH_MAP} = {}) {
  // Closest equivalent of `ref` in `target`'s siddur: the shared section containing it (following each
  // section's fallback, then its service start key), else the start of that service, else the start of the book.
  const books = map.books;
  if (!books[target]) { return null; }
  const byKey = Object.fromEntries(map.sections.concat(map.partialSections || []).map(s => [s.key, s]));
  const {path, segment} = parseSiddurRef(ref);
  const source = nusachForBook(path.split(", ")[0], books);
  if (source === target) { return ref; }
  const position = source && findPosition(map.positions[source], path);
  if (!position) { return books[target].title; }
  let key = anchorAt(position, segment || 1);
  let service = null;
  const seen = new Set();
  while (key && byKey[key] && !seen.has(key)) {
    seen.add(key);
    const section = byKey[key];
    service = service || section.service;
    if (section.refs[target]) { return section.refs[target]; }
    const serviceStartKey = `${section.service}/start`;
    key = section.fallback || (byKey[serviceStartKey] ? serviceStartKey : null);
  }
  return SERVICES.includes(service) ? serviceStartRef(target, service, books) : books[target].title;
}

export function shouldShowLandingPicker({isSiddur, mode, multiPanel, savedNusach, seenPicker, forcePicker}) {
  // The landing picker is for new mobile-web readers of a siddur; the debug param forces it anywhere.
  if (!isSiddur || mode !== "Text") { return false; }
  return !!forcePicker || (!multiPanel && !savedNusach && !seenPicker);
}

export function nusachDebugParams(search) {
  // ?nusachPicker=1 forces the picker; ?nusachCountry=il overrides the IP country (cauldrons have no Cloudflare header).
  const params = new URLSearchParams(search || "");
  return {
    forcePicker: params.get("nusachPicker") === "1",
    countryCode: params.get("nusachCountry") || null,
  };
}

const STORED_NUSACH_KEY = "siddur.nusach";
const PICKER_SEEN_KEY = "siddur.nusachPickerSeen";

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
}

export function getStoredNusach() {
  const n = storageGet(STORED_NUSACH_KEY);
  return isNusach(n) ? n : null;
}
export const setStoredNusach = n => isNusach(n) && storageSet(STORED_NUSACH_KEY, n);
export const hasSeenNusachPicker = () => storageGet(PICKER_SEEN_KEY) === "1";
export const markNusachPickerSeen = () => storageSet(PICKER_SEEN_KEY, "1");

// Reader mode on the three siddurim. "siddur": a segment or header-title tap opens the siddur TOC overlay
// (with the nusach switcher) and there is no resource panel. "learning": stock reader behavior.
export const READER_MODES = ["siddur", "learning"];
const STORED_READER_MODE_KEY = "siddur.mode";

export const isReaderMode = m => READER_MODES.includes(m);

export function readerModeFor({isSiddur, storedMode}) {
  // Siddurim default to Siddur Mode unless the reader chose Learning Mode; every other book is always Learning Mode.
  if (!isSiddur) { return "learning"; }
  return isReaderMode(storedMode) ? storedMode : "siddur";
}

export const isSiddurModeActive = ({book, storedMode, books = NUSACH_BOOKS}) =>
    readerModeFor({isSiddur: isSiddurBook(book, books), storedMode}) === "siddur";

export function getStoredReaderMode() {
  const m = storageGet(STORED_READER_MODE_KEY);
  return isReaderMode(m) ? m : null;
}
export const setStoredReaderMode = m => isReaderMode(m) && storageSet(STORED_READER_MODE_KEY, m);

export function trackSiddurEvent(name, params) {
  // GA4 event, guarded like signupAnalytics: base.html defines gtag only when GOOGLE_GTAG is set.
  if (typeof window === "undefined" || typeof window.gtag !== "function") { return; }
  window.gtag("event", name, params);
}
