/**
 * What the associated-texts panel shows for one segment, and in what order. Pure functions over
 * the link objects /api/links/<ref>?with_text=0 returns; nothing here fetches or touches the DOM.
 *
 * Product rules (see the NG decisions): books only (no sheets, no topics); the corpus's major
 * commentators first, then the rest A–Z (aleph–tav in a Hebrew interface); category groups
 * next; "Quoting Commentary" presented as "Cited by" and disclosed progressively; links without
 * an English translation are kept and labelled "Hebrew only" for translation-only readers.
 */

/**
 * The major commentators of each corpus, in the order they are offered. The panel shows the
 * first TOP_COUNT of these that the segment actually has. An entry is a collectiveTitle, or
 * {key, titles} when one commentator's work is split under several titles.
 */
export const TOP_COMMENTATORS = {
  Tanakh: [
    'Rashi', 'Ramban', 'Ibn Ezra', 'Sforno',
    {key: 'Onkelos', pattern: /^Onkelos\b/, short: 'Onkelos', heShort: 'אונקלוס'},
    {key: 'Targum Jonathan', pattern: /^Targum Jonathan\b/, short: 'Targum Jonathan', heShort: 'תרגום יונתן'},
    'Radak', 'Metzudat David', 'Malbim', 'Ralbag',
  ],
  Talmud: [
    'Rashi', 'Tosafot', 'Steinsaltz', 'Rashba',
    {key: 'Maharsha', titles: ['Maharsha', 'Chidushei Halachot', 'Chidushei Agadot']},
    'Ritva', 'Meiri', 'Rif', 'Rosh',
  ],
  Mishnah: [
    'Bartenura', 'English Explanation of Mishnah', 'Tosafot Yom Tov', 'Rambam', 'Ikar Tosafot Yom Tov', 'Yachin',
  ],
};
export const TOP_COUNT = 5;

export const CITED_BY = 'Quoting Commentary';

// Categories whose works can be "major commentators". Everything else is only in its group.
const TOP_ELIGIBLE = new Set(['Commentary', 'Targum']);

// Group order: Commentary and Targum first, then the corpus's closest relatives, then the library's order.
const BASE_ORDER = [
  'Commentary', 'Targum', 'Tanakh', 'Mishnah', 'Talmud', 'Midrash', 'Halakhah', 'Responsa', 'Tosefta',
  'Kabbalah', 'Chasidut', 'Jewish Thought', 'Musar', 'Liturgy', 'Second Temple', 'Reference',
];
const CORPUS_ORDER = {
  Tanakh: ['Commentary', 'Targum', 'Talmud', 'Midrash', 'Halakhah'],
  Talmud: ['Commentary', 'Tanakh', 'Talmud', 'Halakhah', 'Midrash'],
  Mishnah: ['Commentary', 'Tanakh', 'Mishnah', 'Talmud'],
  Midrash: ['Commentary', 'Tanakh', 'Talmud', 'Midrash'],
  Halakhah: ['Commentary', 'Tanakh', 'Talmud', 'Halakhah'],
};

const HE_CATEGORIES = {
  Commentary: 'מפרשים', Targum: 'תרגומים', Tanakh: 'תנ״ך', Mishnah: 'משנה', Talmud: 'תלמוד', Midrash: 'מדרש',
  Halakhah: 'הלכה', Responsa: 'שו״ת', Tosefta: 'תוספתא', Kabbalah: 'קבלה', Chasidut: 'חסידות',
  'Jewish Thought': 'מחשבת ישראל', Musar: 'מוסר', Liturgy: 'תפילה', 'Second Temple': 'ספרות בית שני',
  Reference: 'מילונים וספרי יעץ', Essay: 'מאמרים', Guides: 'מדריכים', [CITED_BY]: 'מצוטט אצל',
};

/** A category's name in the interface language (Hebrew names are local, so SSR needs no data). */
export function categoryLabel(category, interfaceLang, citedByLabel = 'Cited by') {
  if (category === CITED_BY) { return interfaceLang === 'hebrew' ? HE_CATEGORIES[CITED_BY] : citedByLabel; }
  return interfaceLang === 'hebrew' ? (HE_CATEGORIES[category] || category) : category;
}

/**
 * The corpus whose major commentators apply to a section ('Tanakh', 'Talmud', 'Mishnah', or null).
 * The primary category decides when there is one: "Rashi on Genesis" is filed under Tanakh but
 * its primary category is Commentary, so the Tanakh's commentators (and pins) don't apply to it.
 */
export function corpusOf(section) {
  if (!section) { return null; }
  if (section.primaryCategory) { return TOP_COMMENTATORS[section.primaryCategory] ? section.primaryCategory : null; }
  return (section.categories || []).find(c => c && TOP_COMMENTATORS[c]) || null;
}

function normalizeEntry(entry) {
  if (typeof entry === 'string') { return {key: entry, titles: [entry]}; }
  return {key: entry.key, titles: entry.titles || [], pattern: entry.pattern || null, short: entry.short, heShort: entry.heShort};
}

function entryMatches(entry, title) {
  return entry.titles.includes(title) || (!!entry.pattern && entry.pattern.test(title));
}

const collators = {};
function collator(lang) {
  if (!collators[lang]) {
    collators[lang] = typeof Intl !== 'undefined' && Intl.Collator
      ? new Intl.Collator(lang, {sensitivity: 'base', numeric: true})
      : {compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0)};
  }
  return collators[lang];
}
// Quotes and geresh/gershayim don't count ("Ba'al" sorts as "Baal", "רש״י" as "רשי"); spaces do (word by word).
const MARKS = /["'“”‘’׳״()[\]]/g;

/** A–Z by English title, or aleph–tav by Hebrew title in a Hebrew interface. */
export function compareBooks(a, b, interfaceLang) {
  const hebrew = interfaceLang === 'hebrew';
  const ka = ((hebrew ? a.heTitle : a.title) || a.title || '').replace(MARKS, '').trim();
  const kb = ((hebrew ? b.heTitle : b.title) || b.title || '').replace(MARKS, '').trim();
  return collator(hebrew ? 'he' : 'en').compare(ka, kb) || collator('en').compare(a.title, b.title);
}

/** Natural order for refs: "Rashi on Genesis 1:1:2" before "Rashi on Genesis 1:1:10". */
export function compareRefs(a, b) {
  return collator('en').compare(a || '', b || '');
}

function compareLinks(a, b) {
  if (typeof a.commentaryNum === 'number' && typeof b.commentaryNum === 'number' && a.commentaryNum !== b.commentaryNum) {
    return a.commentaryNum - b.commentaryNum;
  }
  return compareRefs(a.sourceRef || a.ref, b.sourceRef || b.ref);
}

/** Links the panel shows: books only. Essays are dropped, as the data layer's link summary does. */
export function panelLinks(links) {
  return (links || []).filter(l => l && l.type !== 'essay' && l.collectiveTitle && l.collectiveTitle.en);
}

export function bookKey(category, title) {
  return `${category}|${title}`;
}

/**
 * One entry per work: {key, title, heTitle, category, count, hasEnglish, links}. `title` is the
 * link's collectiveTitle (what pins and `with=` match); displayTitle() is what rows show.
 */
export function booksFromLinks(links) {
  const books = new Map();
  for (const link of panelLinks(links)) {
    const title = link.collectiveTitle.en;
    const key = bookKey(link.category, title);
    let book = books.get(key);
    if (!book) {
      book = {key, title, heTitle: link.collectiveTitle.he || title, category: link.category, count: 0, hasEnglish: false, links: []};
      books.set(key, book);
    }
    book.count += 1;
    book.hasEnglish = book.hasEnglish || !!link.sourceHasEn;
    book.links.push(link);
  }
  for (const book of books.values()) { book.links.sort(compareLinks); }
  return Array.from(books.values());
}

/**
 * The major commentators present in `books`, in the corpus's order, at most TOP_COUNT slots.
 * A slot whose commentator's work comes under several titles yields each of them. Books get
 * the slot's short display title where it has one (shortTitle / heShortTitle).
 */
export function topBooks(books, corpus) {
  const entries = (TOP_COMMENTATORS[corpus] || []).map(normalizeEntry);
  const eligible = books.filter(b => TOP_ELIGIBLE.has(b.category));
  const out = [];
  let slots = 0;
  for (const entry of entries) {
    if (slots >= TOP_COUNT) { break; }
    const matches = eligible.filter(b => entryMatches(entry, b.title) && !out.includes(b));
    if (matches.length) {
      // "Onkelos Genesis" is listed as "Onkelos" (the book is the one being read).
      if (entry.short) { matches.forEach(b => { b.shortTitle = entry.short; b.heShortTitle = entry.heShort || b.heTitle; }); }
      slots += 1;
      out.push(...matches.sort((a, b) => b.count - a.count));
    }
  }
  return out;
}

/**
 * The panel's first list: the reader's pins, then the corpus's major commentators. A pin always
 * leads, even a work outside the defaults (a Chasidut or Halakhah work), so the list grows to
 * hold it and a pinned work is always found at the top. Entries: {key, book, pin, pinned};
 * `book` is null when a pinned work has nothing on this segment (it is still listed, to unpin).
 */
export function shortList(grouped, pinList = []) {
  const out = [];
  for (const pin of pinList || []) {
    const book = grouped.books.find(b => b.title === pin.title && b.category === pin.category && b.category !== CITED_BY) || null;
    if (book && pin.shortTitle && !book.shortTitle) { book.shortTitle = pin.shortTitle; book.heShortTitle = pin.heShortTitle; }
    out.push({key: book ? book.key : bookKey(pin.category, pin.title), book, pin, pinned: true});
  }
  for (const book of grouped.top) {
    if (!out.some(e => e.book === book)) { out.push({key: book.key, book, pin: null, pinned: false}); }
  }
  return out;
}

/**
 * What "Open" shows front and center for a work's comments on a segment: the first run of
 * consecutive comments, as one ref ("Rashi on Genesis 1:1:1-3"), or its first comment.
 */
export function openTarget(refs) {
  const list = (refs || []).filter(Boolean);
  if (!list.length) { return null; }
  return groupSourceRefs(list)[0].ref;
}

export function bookOpenTarget(book) {
  return book ? openTarget(book.links.map(l => l.sourceRef || l.ref)) : null;
}

function categoryRank(category, corpus) {
  const order = [...(CORPUS_ORDER[corpus] || []), ...BASE_ORDER.filter(c => !(CORPUS_ORDER[corpus] || []).includes(c))];
  const i = order.indexOf(category);
  return i === -1 ? order.length : i;
}

/**
 * Everything the panel's first screen needs:
 *   total      number of links shown
 *   top        the major commentators (Commentary / Targum works), in the corpus's order
 *   categories [{category, count, books}] in group order; within Commentary the major
 *              commentators come first, then the rest; within the others, A–Z
 *   citedBy    {category, count, books} for "Quoting Commentary", or null
 */
export function groupLinks(links, {corpus = null, interfaceLang = 'english'} = {}) {
  const books = booksFromLinks(links);
  const top = topBooks(books, corpus);
  const byCategory = new Map();
  for (const book of books) {
    if (!byCategory.has(book.category)) { byCategory.set(book.category, []); }
    byCategory.get(book.category).push(book);
  }
  const alpha = (a, b) => compareBooks(a, b, interfaceLang);
  const group = (category, list) => {
    const sorted = list.slice().sort(alpha);
    const leading = top.filter(b => b.category === category);
    const ordered = [...leading, ...sorted.filter(b => !leading.includes(b))];
    return {category, count: list.reduce((n, b) => n + b.count, 0), books: ordered, leading: leading.length};
  };
  const categories = Array.from(byCategory.keys())
    .filter(c => c !== CITED_BY)
    .sort((a, b) => (categoryRank(a, corpus) - categoryRank(b, corpus)) || alpha({title: a, heTitle: HE_CATEGORIES[a]}, {title: b, heTitle: HE_CATEGORIES[b]}))
    .map(c => group(c, byCategory.get(c)));
  const citedBy = byCategory.has(CITED_BY) ? group(CITED_BY, byCategory.get(CITED_BY)) : null;
  const total = books.reduce((n, b) => n + b.count, 0);
  return {total, top, categories, citedBy, books};
}

export function displayTitle(book, interfaceLang) {
  return interfaceLang === 'hebrew' ? (book.heShortTitle || book.heTitle || book.title) : (book.shortTitle || book.title);
}

/** Translation-only readers see links that have no English; they are labelled, not hidden. */
export function isHebrewOnly(item, language) {
  return language === 'english' && !item.hasEnglish;
}

/**
 * A `with=` value (the classic reader's connections filter) as a panel view, once the links are
 * known: a work ("Rashi"), a category ("Midrash", "Commentary ConnectionsList"), "Quoting
 * Commentary", or a quoted work ("Rashi|Quoting"). Null when nothing matches.
 */
export function resolveFilter(grouped, name) {
  if (!grouped || !name) { return null; }
  const clean = String(name).replace(/_/g, ' ').replace(/ ConnectionsList$/, '').trim();
  const [title, quoting] = clean.split('|');
  const books = grouped.books;
  if (quoting === 'Quoting') {
    const quoted = books.find(b => b.category === CITED_BY && b.title === title);
    return quoted ? {kind: 'book', key: quoted.key} : null;
  }
  const book = books.find(b => b.title === title && b.category !== CITED_BY) || books.find(b => b.title === title);
  if (book) { return {kind: 'book', key: book.key}; }
  if (title === CITED_BY && grouped.citedBy) { return {kind: 'category', category: CITED_BY}; }
  if (grouped.categories.some(c => c.category === title)) { return {kind: 'category', category: title}; }
  return null;
}

/** The `with=` value for a panel stack: its deepest work or category, else "all". */
export function connectionsParam(stack, books) {
  for (let i = (stack || []).length - 1; i >= 0; i--) {
    const view = stack[i];
    if (view.kind === 'book') {
      const book = (books || []).find(b => b.key === view.key);
      const title = book ? book.title : String(view.key).split('|').slice(1).join('|');
      return (book ? book.category : String(view.key).split('|')[0]) === CITED_BY ? `${title}|Quoting` : title;
    }
    if (view.kind === 'category') { return view.category; }
    if (view.kind === 'filter') { return view.name; }
  }
  return 'all';
}

/**
 * Group consecutive comment refs into ranges so one request fetches a commentator's comments on
 * a segment: ["Rashi on Genesis 1:1:1", "...:2", "...:3"] -> "Rashi on Genesis 1:1:1-3".
 * Returns [{ref, refs}] in the original order; refs that are already ranges stay alone.
 */
export function groupSourceRefs(refs) {
  const groups = [];
  let current = null;
  for (const ref of refs) {
    const m = /^(.*[ :])(\d+)$/.exec(ref);
    if (m && current && current.parent === m[1] && Number(m[2]) === current.last + 1) {
      current.last = Number(m[2]);
      current.refs.push(ref);
      continue;
    }
    current = m ? {parent: m[1], first: Number(m[2]), last: Number(m[2]), refs: [ref]} : {parent: null, refs: [ref]};
    groups.push(current);
  }
  return groups.map(g => ({
    ref: g.parent && g.last !== g.first ? `${g.parent}${g.first}-${g.last}` : g.refs[0],
    refs: g.refs,
    first: g.parent ? g.first : null,
  }));
}

/** Compact counts for the segment badges: 7, 42, 1.8k. */
export function formatCount(n) {
  if (n < 1000) { return String(n); }
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}
