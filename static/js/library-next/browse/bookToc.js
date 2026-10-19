/** Pure shaping of `/api/v2/index` details into the book page's table of contents. */
import Sefaria from '../../sefaria/sefaria';

/** Section labels for address type `type` at 0-based index `i`: `{ en, he, ref }` suffixes. */
export function sectionLabel(type, i) {
  if (type === 'Talmud') {
    const daf = Sefaria.hebrew.intToDaf(i);
    return { en: daf, he: Sefaria.hebrew.encodeHebrewDaf(daf), address: daf };
  }
  if (type === 'Folio') {
    const folio = Sefaria.hebrew.intToFolio(i);
    return { en: folio, he: Sefaria.hebrew.encodeHebrewFolio(folio), address: folio };
  }
  const n = i + 1;
  return { en: String(n), he: Sefaria.hebrew.encodeHebrewNumeral(n), address: String(n) };
}

const hasContent = (count) => (Array.isArray(count) ? count.some(hasContent) : count > 0);

/**
 * The top-level sections of a JaggedArrayNode as `[{ en, he, ref }]`, skipping empty ones
 * (Talmud starts at 2a, so 1a/1b are empty). `baseRef` is the node's ref ("Berakhot" or
 * "Pesach Haggadah, Kadesh").
 */
export function jaggedSections(node, baseRef) {
  const counts = Array.isArray(node.content_counts) ? node.content_counts : null;
  const length = counts ? counts.length : ((node.lengths && node.lengths[0]) || 0);
  const type = (node.addressTypes && node.addressTypes[0]) || 'Integer';
  const out = [];
  for (let i = 0; i < length; i++) {
    if (counts && !hasContent(counts[i])) { continue; }
    const label = sectionLabel(type, i);
    out.push({ en: label.en, he: label.he, ref: `${baseRef} ${label.address}` });
  }
  return out;
}

export const sectionName = (node, lang) => ((lang === 'he' ? node.heSectionNames : node.sectionNames) || node.sectionNames || [])[0] || '';

/**
 * Flatten a complex schema into `[{ title: {en,he}, ref, depth, leaf, sections }]` rows in
 * reading order. Default nodes (no title) inherit the parent's ref.
 */
export function schemaRows(schema, bookTitle) {
  const rows = [];
  const walk = (node, parentRef, depth) => {
    const own = node.default ? parentRef : (depth === 0 ? bookTitle : `${parentRef}, ${node.title}`);
    if (node.nodes) {
      if (depth > 0) { rows.push({ title: { en: node.title, he: node.heTitle }, ref: own, depth, leaf: false }); }
      node.nodes.forEach(child => walk(child, own, depth + 1));
    } else {
      rows.push({
        title: { en: node.default ? '' : node.title, he: node.default ? '' : node.heTitle },
        ref: own, depth, leaf: true,
        sections: node.depth > 1 ? jaggedSections(node, own) : [],
      });
    }
  };
  walk(schema, bookTitle, 0);
  return rows;
}

/**
 * Alternate structure (parashot, chapters) nodes as `[{ title, ref, sections }]`; `sections`
 * are the node's `refs` labelled by their address ("2a", "1:1-2:3").
 */
export function altRows(alt, bookTitle) {
  const strip = (ref) => ref.replace(bookTitle, '').replace(/^[ ,]+/, '').trim().split(':')[0];
  const heLabel = (en) => (/^\d+[ab]$/.test(en) ? Sefaria.hebrew.encodeHebrewDaf(en) : (/^\d+$/.test(en) ? Sefaria.hebrew.encodeHebrewNumeral(Number(en)) : null));
  return (alt.nodes || []).map(node => ({
    title: { en: node.title, he: node.heTitle },
    ref: node.wholeRef,
    sections: node.includeSections && node.refs ? node.refs.map(ref => { const en = strip(ref); return { ref, en, he: heLabel(en) }; }) : [],
  }));
}

/** The structure tabs for a book: `[{ id, label: {en,he}, kind: 'schema'|'alt' }]`, default first. */
export function structures(details) {
  const exclude = new Set(details.exclude_structs || []);
  const tabs = [];
  const schema = details.schema || {};
  if (!exclude.has('schema')) {
    tabs.push({
      id: 'schema', kind: 'schema',
      label: schema.nodes ? null : { en: (schema.sectionNames || [])[0] || 'Sections', he: (schema.heSectionNames || schema.sectionNames || [])[0] || '' },
    });
  }
  for (const [name, alt] of Object.entries(details.alts || {})) {
    if (exclude.has(name)) { continue; }
    tabs.push({ id: name, kind: 'alt', label: { en: name, he: Sefaria.hebrewTerm(name) || name } });
  }
  const preferred = details.default_struct && tabs.find(tab => tab.id === details.default_struct);
  if (preferred) { tabs.splice(tabs.indexOf(preferred), 1); tabs.unshift(preferred); }
  return tabs;
}

/** Versions by bucket: `{ he: [], en: [], other: [] }` from `Sefaria.getVersions` output. */
export function versionBuckets(byLang) {
  const out = { he: [], en: [], other: [] };
  for (const [lang, list] of Object.entries(byLang || {})) {
    const key = lang === 'he' || lang === 'en' ? lang : 'other';
    out[key] = out[key].concat(list || []);
  }
  const byPriority = (a, b) => (parseFloat(b.priority) || 0) - (parseFloat(a.priority) || 0);
  out.he.sort(byPriority); out.en.sort(byPriority); out.other.sort(byPriority);
  return out;
}
