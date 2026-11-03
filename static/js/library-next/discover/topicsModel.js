/**
 * Topic logic without React: categories from `Sefaria.topic_toc`, source ordering, related
 * topic groups, the newcomer starter list and small text helpers.
 */
import Sefaria from '../../sefaria/sefaria';
import { refToUrl } from './refs';

/** Curated starter topics for newcomers (slugs exist on sefaria.org with EN and HE descriptions). */
export const STARTER_TOPICS = ['shabbat', 'torah', 'prayer', 'passover', 'abraham', 'moses', 'tzedakah'];

const SHOW = t => !!t && t.shouldDisplay !== false;

/** Top-level topic categories: `{ slug, title, description, count }`. */
export function topicCategories() {
  const toc = Sefaria.topic_toc || [];
  return toc.filter(SHOW).map(c => ({
    slug: c.slug,
    title: c.primaryTitle || { en: c.en, he: c.he },
    description: c.categoryDescription || {},
    count: (c.children || []).filter(SHOW).length,
  }));
}

/** The TOC node for a category slug (any depth), or null. */
export function findCategory(slug, nodes = Sefaria.topic_toc || []) {
  for (const node of nodes) {
    if (node.slug === slug && node.children) { return node; }
    const inner = node.children ? findCategory(slug, node.children) : null;
    if (inner) { return inner; }
  }
  return null;
}

/** Children of a category: `{ slug, title, description, isCategory, count }`, display order. */
export function categoryChildren(slug) {
  const node = findCategory(slug);
  if (!node) { return []; }
  return (node.children || []).filter(SHOW)
    .sort((a, b) => (a.displayOrder ?? 1e9) - (b.displayOrder ?? 1e9))
    .map(c => ({
      slug: c.slug,
      title: c.primaryTitle || { en: c.en, he: c.he },
      description: c.description || c.categoryDescription || {},
      isCategory: !!c.children,
      count: c.children ? c.children.filter(SHOW).length : (c.numSources || 0),
    }));
}

/** Markdown-ish topic descriptions → plain text (links and emphasis dropped). */
export function plainText(md) {
  return String(md || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function firstSentence(text, max = 180) {
  const t = plainText(text);
  if (t.length <= max) { return t; }
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('؟'), cut.lastIndexOf('! '));
  return (end > 60 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…');
}

/**
 * Order topic sources. `relevance`: curated primacy for the interface language first, then
 * PageRank; `chronological`: composition date, then canonical order (as the classic page does).
 */
export function sortRefs(refs, mode = 'relevance', lang = 'en') {
  const order = r => r.order || {};
  return refs.slice().sort((a, b) => {
    const oa = order(a); const ob = order(b);
    if (!a.order !== !b.order) { return a.order ? -1 : 1; }
    if (mode === 'chronological') {
      const da = oa.comp_date ?? 1e9; const db = ob.comp_date ?? 1e9;
      if (da !== db) { return da - db; }
      return String(oa.order_id || '').localeCompare(String(ob.order_id || ''));
    }
    const pa = (oa.curatedPrimacy && oa.curatedPrimacy[lang]) || 0;
    const pb = (ob.curatedPrimacy && ob.curatedPrimacy[lang]) || 0;
    if (pa !== pb) { return pb - pa; }
    const la = (oa.availableLangs || []).includes(lang) ? 1 : 0;
    const lb = (ob.availableLangs || []).includes(lang) ? 1 : 0;
    if (la !== lb) { return lb - la; }
    return (ob.pr || 0) - (oa.pr || 0) || (ob.tfidf || 0) - (oa.tfidf || 0);
  });
}

/** Does this source carry a curated note in `lang` (title or prompt, published)? */
export function isNotable(ref, lang) {
  const d = ref.descriptions && ref.descriptions[lang];
  return !!(d && (d.title || d.prompt) && d.published !== false);
}

/** The tabs a topic page shows, from `Sefaria.getTopic()`'s `tabs` (library module). */
export function sourceTabs(topicData) {
  const tabs = (topicData && topicData.tabs) || {};
  const out = [];
  if (tabs['notable-sources'] && tabs['notable-sources'].refs.length) { out.push({ id: 'notable', key: 'topic.notable', refs: tabs['notable-sources'].refs }); }
  if (tabs.sources && tabs.sources.refs.length) { out.push({ id: 'sources', key: 'topic.sources', refs: tabs.sources.refs }); }
  if (tabs['popular-writing-of'] && tabs['popular-writing-of'].refs.length) { out.push({ id: 'citations', key: 'topic.citations', refs: tabs['popular-writing-of'].refs }); }
  return out;
}

/** Related topics grouped by link type, displayable ones only, strongest first. */
export function relatedGroups(links, { perGroup = 8 } = {}) {
  const groups = [];
  for (const [type, group] of Object.entries(links || {})) {
    if (!group || group.shouldDisplay === false || !group.links) { continue; }
    const topics = group.links.filter(l => l.shouldDisplay !== false && l.topic)
      .sort((a, b) => ((b.order && b.order.tfidf) || 0) - ((a.order && a.order.tfidf) || 0))
      .slice(0, perGroup)
      .map(l => ({ slug: l.topic, title: l.title || { en: l.topic, he: l.topic } }));
    if (!topics.length) { continue; }
    const title = (topics.length > 1 && group.pluralTitle) || group.title || { en: type, he: type };
    groups.push({ type, title, topics });
  }
  return groups.sort((a, b) => b.topics.length - a.topics.length);
}

/** Alphabetical index of displayable library topics: `[{ letter, topics }]` in `lang`. */
export function alphabetize(topics, lang = 'en') {
  const byLetter = new Map();
  for (const t of topics || []) {
    if (!SHOW(t) || !(t.pools || []).includes('library')) { continue; }
    const title = (t.primaryTitle && t.primaryTitle[lang]) || t[lang] || t.en;
    if (!title) { continue; }
    const letter = title[0].toUpperCase();
    if (!byLetter.has(letter)) { byLetter.set(letter, []); }
    byLetter.get(letter).push({ slug: t.slug, title: t.primaryTitle || { en: t.en, he: t.he }, numSources: t.numSources || 0 });
  }
  const collator = new Intl.Collator(lang === 'he' ? 'he' : 'en');
  return [...byLetter.entries()]
    .map(([letter, list]) => ({ letter, topics: list.sort((a, b) => collator.compare(a.title[lang] || a.title.en, b.title[lang] || b.title.en)) }))
    .sort((a, b) => collator.compare(a.letter, b.letter));
}

/** Find topics whose titles contain `q` (any language), for the in-page topic finder. */
export function matchTopics(topics, q, { limit = 12 } = {}) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) { return []; }
  const out = [];
  for (const t of topics || []) {
    if (!SHOW(t)) { continue; }
    const titles = (t.titles || []).map(x => x.text.toLowerCase());
    if (titles.some(x => x.includes(needle))) { out.push(t); }
    if (out.length >= limit * 3) { break; }
  }
  return out.sort((a, b) => (b.numSources || 0) - (a.numSources || 0)).slice(0, limit);
}

export function topicUrl(slug) { return `/topics/${slug}`; }
export function categoryUrl(slug) { return `/topics/category/${slug}`; }

/** Reader URL for a topic source ref. */
export function refUrl(ref) { return refToUrl(ref); }
