/**
 * The table of contents of a book, built from its index record (Sefaria.getIndexDetails, i.e.
 * /api/v2/index/{title}?with_content_counts=1). Pure: no DOM, no browser globals, so it can be
 * tested on fixtures and would run under SSR.
 *
 * The model:
 *   {title, heTitle, categories, heCategories, root: TocNode, alts: [TocAlt]}
 *   TocNode = {id, title, heTitle, ref, sectionName, heSectionName, talmud,
 *              sections: [TocSection] | null,   // a grid of chapters / dapim
 *              children: [TocNode] | null}      // a schema's parts (a collapsible tree)
 *   TocSection = {ref, match, label, heLabel, empty}
 *   TocAlt = {name, title, heTitle, items: [{ref, wholeRef, title, heTitle, subtitle, start, end}]}
 *
 * A section's `ref` is what the reader opens; `match` is the ref the reader's current section
 * is compared with (they differ for depth-3 texts, where a grid cell is a chapter and the
 * reader opens its first section with content).
 */
import Sefaria from '../sefaria/sefaria';

const hebrewNumeral = (n) => Sefaria.hebrew.encodeHebrewNumeral(n);
const hebrewDaf = (daf) => Sefaria.hebrew.encodeHebrewDaf(daf);

/** "2a" for section index 2 (1a is index 0). */
export function dafLabel(index) {
  return `${Math.floor(index / 2) + 1}${index % 2 ? 'b' : 'a'}`;
}

/** The position of a daf address in a Talmud array: "2a" -> 2, "2b" -> 3. */
export function dafIndex(daf) {
  const m = /^(\d+)([ab])$/.exec(String(daf));
  return m ? (parseInt(m[1], 10) - 1) * 2 + (m[2] === 'b' ? 1 : 0) : NaN;
}

function contentCount(value) {
  if (typeof value === 'number') { return value; }
  if (Array.isArray(value)) { return value.reduce((sum, v) => sum + contentCount(v), 0); }
  return 0;
}

function firstNonEmpty(values) {
  if (!Array.isArray(values)) { return -1; }
  return values.findIndex(v => contentCount(v) > 0);
}

const SECTION_PLURALS = {
  Chapter: 'Chapters', Perek: 'Chapters', Daf: 'Dapim', Siman: 'Simanim', Mishnah: 'Mishnayot',
  Halakhah: 'Halakhot', Psalm: 'Psalms', Parasha: 'Parashot', Seif: 'Seifim', Section: 'Sections',
  Part: 'Parts', Paragraph: 'Paragraphs', Book: 'Books', Gate: 'Gates', Letter: 'Letters',
};
const HE_SECTION_PLURALS = {
  'פרק': 'פרקים', 'דף': 'דפים', 'סימן': 'סימנים', 'משנה': 'משניות', 'הלכה': 'הלכות', 'מזמור': 'מזמורים',
  'פרשה': 'פרשות', 'סעיף': 'סעיפים', 'חלק': 'חלקים',
};

export function sectionPlural(name) { return SECTION_PLURALS[name] || name || ''; }
export function heSectionPlural(name) { return HE_SECTION_PLURALS[name] || name || ''; }

/** The grid for a jagged array node whose ref is `ref`. */
function sectionsFor(node, ref) {
  const depth = node.depth || 1;
  if (depth < 2) { return null; }
  const talmud = (node.addressTypes || [])[0] === 'Talmud';
  const counts = Array.isArray(node.content_counts) ? node.content_counts : null;
  const length = counts ? counts.length : ((node.lengths || [])[0] || 0);
  const sections = [];
  for (let i = 0; i < length; i++) {
    const address = talmud ? dafLabel(i) : String(i + 1);
    const count = counts ? counts[i] : 1;
    const empty = counts ? contentCount(count) === 0 : false;
    if (talmud && empty && !sections.length) { continue; }  // Talmud starts on 2a
    const match = `${ref} ${address}`;
    let open = match;
    if (depth > 2) {
      // A depth-3 text reads in sections one level down: open the chapter's first one with content.
      const sub = firstNonEmpty(count);
      open = `${match}:${sub === -1 ? 1 : sub + 1}`;
    }
    sections.push({
      ref: open,
      match,
      label: address,
      heLabel: talmud ? hebrewDaf(address) : hebrewNumeral(i + 1),
      empty,
    });
  }
  // A Talmud tractate's trailing empty amudim (a last daf with only an "a" side) are not shown.
  while (talmud && sections.length && sections[sections.length - 1].empty) { sections.pop(); }
  return sections;
}

function nodeTitle(node, lang) {
  if (lang === 'he') { return node.heTitle || (node.titles || []).find(t => t.lang === 'he' && t.primary)?.text || node.title || ''; }
  return node.title || (node.titles || []).find(t => t.lang === 'en' && t.primary)?.text || node.key || '';
}

function buildNode(node, ref, id) {
  const isDefault = !!node.default || node.key === 'default';
  const base = {
    id,
    title: isDefault ? '' : nodeTitle(node, 'en'),
    heTitle: isDefault ? '' : nodeTitle(node, 'he'),
    ref,
    isDefault,
    sectionName: (node.sectionNames || [])[0] || '',
    heSectionName: (node.heSectionNames || [])[0] || '',
    talmud: (node.addressTypes || [])[0] === 'Talmud',
    sections: null,
    children: null,
  };
  if (Array.isArray(node.nodes)) {
    base.children = node.nodes.map((child, i) => {
      const childDefault = !!child.default || child.key === 'default';
      const childRef = childDefault ? ref : `${ref}, ${nodeTitle(child, 'en')}`;
      return buildNode(child, childRef, `${id}.${i}`);
    });
    return base;
  }
  base.sections = sectionsFor(node, ref);
  return base;
}

/** Parse the address after a book title: "1:3" -> ["1", "3"], "2a:5" -> ["2a", "5"]. */
function addressParts(ref, bookTitle) {
  if (!ref || ref.indexOf(bookTitle) !== 0) { return null; }
  const rest = ref.slice(bookTitle.length).trim();
  return rest ? rest.split(':') : [];
}

function partValue(part) {
  if (/^\d+[ab]$/.test(part)) { return dafIndex(part); }
  const n = parseInt(part, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** A comparable position for a ref in a simple book: [section, segment, ...] as numbers. */
export function refPosition(ref, bookTitle) {
  const parts = addressParts(ref, bookTitle);
  return parts ? parts.map(partValue) : null;
}

function compare(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] === undefined ? 0 : a[i];
    const y = b[i] === undefined ? 0 : b[i];
    if (x !== y) { return x < y ? -1 : 1; }
  }
  return 0;
}

/** "Genesis 1:1-6:8" -> {start: "Genesis 1:1", startParts, endParts}; "Berakhot 2a:1-13a:15" alike. */
export function splitRange(wholeRef, bookTitle) {
  const [startRef, endRest] = String(wholeRef).split('-');
  const startParts = addressParts(startRef, bookTitle);
  if (!startParts) { return null; }
  let endParts = endRest ? endRest.split(':') : startParts.slice();
  if (endParts.length < startParts.length) {
    // "Genesis 1:1-31" ends at 1:31: the missing leading parts come from the start.
    endParts = [...startParts.slice(0, startParts.length - endParts.length), ...endParts];
  }
  return {start: startRef.trim(), startParts, endParts};
}

/** "Genesis 1:1" is in "Genesis 1:1-6:8"; a section ref ("Genesis 6") counts if its start is in range. */
export function rangeContains(range, position) {
  if (!range || !position) { return false; }
  const start = range.startParts.map(partValue);
  // An end like "6:8" covers everything in 6:8; an end like "13a" covers all of 13a.
  const end = range.endParts.map(partValue);
  const pos = position.slice(0, Math.max(start.length, 1));
  if (compare(pos, start.slice(0, pos.length)) < 0) { return false; }
  const endCmp = compare(pos.slice(0, end.length), end);
  return endCmp <= 0;
}

function formatParts(parts, hebrew) {
  return parts.map(p => {
    if (!hebrew) { return p; }
    if (/^\d+[ab]$/.test(p)) { return hebrewDaf(p); }
    const n = parseInt(p, 10);
    return Number.isNaN(n) ? p : hebrewNumeral(n);
  }).join(':');
}

function rangeLabel(range, hebrew) {
  if (!range) { return ''; }
  const start = formatParts(range.startParts, hebrew);
  const end = formatParts(range.endParts, hebrew);
  return start === end ? start : `${start}–${end}`;
}

const ALT_NAMES = {
  Parasha: {en: 'Parashot', he: 'פרשות'},
  Chapters: {en: 'Chapters', he: 'פרקים'},
};

function buildAlts(index) {
  const alts = index.alts || {};
  const title = index.title;
  return Object.keys(alts).map(name => {
    const nodes = (alts[name] && alts[name].nodes) || [];
    const items = nodes.filter(n => n.wholeRef && !n.nodes).map(n => {
      const range = splitRange(n.wholeRef, title);
      // "Chapter 1; MeEimatai": the number and the name, set apart.
      const [lead, ...restParts] = String(nodeTitle(n, 'en')).split('; ');
      const rest = restParts.join('; ');
      const number = n.numeric_equivalent || null;
      return {
        ref: range ? range.start : n.wholeRef,
        wholeRef: n.wholeRef,
        title: rest || lead,
        heTitle: nodeTitle(n, 'he'),
        kicker: rest ? lead : '',
        heKicker: rest && number ? `פרק ${hebrewNumeral(number)}` : '',
        subtitle: rangeLabel(range, false),
        heSubtitle: rangeLabel(range, true),
        range,
      };
    });
    const names = ALT_NAMES[name] || {en: name, he: name};
    return {name, title: names.en, heTitle: names.he, items};
  }).filter(alt => alt.items.length);
}

/** The table of contents for an index record, or null if it has no schema. */
export function buildToc(index) {
  if (!index || !index.schema) { return null; }
  const root = buildNode(index.schema, index.title, 'root');
  root.title = index.title;
  root.heTitle = index.heTitle || index.schema.heTitle || index.title;
  return {
    title: index.title,
    heTitle: root.heTitle,
    categories: index.categories || [],
    heCategories: index.heCategories || [],
    root,
    alts: buildAlts(index),
  };
}

/** Whether a TOC section (or leaf node) is where the reader is: its section ref, or inside it. */
export function sectionIsCurrent(section, currentRef) {
  if (!currentRef || !section) { return false; }
  const match = section.match || section.ref;
  return currentRef === match || currentRef.indexOf(`${match}:`) === 0;
}

export function nodeIsCurrent(node, currentRef) {
  if (!currentRef || !node || !node.ref) { return false; }
  if (node.sections) { return node.sections.some(s => sectionIsCurrent(s, currentRef)); }
  if (node.children) { return node.children.some(c => nodeIsCurrent(c, currentRef)); }
  if (currentRef === node.ref) { return true; }
  // Inside the part: its ref followed by an address ("..., Kadesh 3"), not a longer title.
  return currentRef.indexOf(node.ref) === 0 && /^[ :]\d+[ab]?(?::\d+)*$/.test(currentRef.slice(node.ref.length));
}

/** The ids of the tree nodes on the path to the current position, so they start expanded. */
export function currentPath(node, currentRef, path = []) {
  if (!node) { return []; }
  if (!node.children) { return nodeIsCurrent(node, currentRef) ? [...path, node.id] : []; }
  for (const child of node.children) {
    const found = currentPath(child, currentRef, [...path, node.id]);
    if (found.length) { return found; }
  }
  return [];
}

/** The index of the alt item (parasha, perek) that holds `ref`, or -1. */
export function currentAltIndex(alt, ref, bookTitle) {
  const position = refPosition(ref, bookTitle);
  if (!position || !position.length) { return -1; }
  return alt.items.findIndex(item => rangeContains(item.range, position));
}
