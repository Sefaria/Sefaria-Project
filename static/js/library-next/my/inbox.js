/**
 * The discover pages hand persona actions to My Library through kv inbox lists
 * (`discover/personaActions.js`): `lessonInbox`, `planInbox`, `notebookInbox` and
 * `savedSearches`. The hub pages show them and "drain" them: one tap folds an item into a
 * lesson / plan / notebook entry and removes it from the inbox; dismiss removes it alone.
 *
 * Item shapes (newest first, `ts` set by the writer):
 *   ref item     { kind: 'ref', ref, heRef?, snippet?, q?, topic?, title?, from: 'search' | 'topic' }
 *   topic item   { kind: 'topic', topic: <slug>, title: <string | { en, he }>, citation?, text?, from }
 *   saved search { url, q, exact, sort, paths, ts }
 */
import Sefaria from '../../sefaria/sefaria';
import { kv, useKv } from '../store';
import { sortRefs } from '../discover/topicsModel';
import { fetchPreview } from './data';

export const INBOX = { lesson: 'lessonInbox', plan: 'planInbox', notebook: 'notebookInbox', searches: 'savedSearches' };
const EMPTY = [];

/** Identity of an item, as `personaActions.pushUnique` keys it. */
export const inboxKey = (item) => item.ref || item.topic || item.url || '';

export function listInbox(key) {
  const list = kv.get(key, EMPTY);
  return Array.isArray(list) ? list : EMPTY;
}

/** React: the live list for an inbox key. */
export function useInbox(key) {
  const [list] = useKv(key, EMPTY);
  return Array.isArray(list) ? list : EMPTY;
}

export function removeFromInbox(key, item) {
  const id = inboxKey(item);
  kv.set(key, listInbox(key).filter(x => inboxKey(x) !== id));
}

export function clearInbox(key) {
  kv.set(key, []);
}

/** Display title of an item in the current language (topic titles may be `{ en, he }`). */
export function inboxTitle(item, lang = 'en') {
  if (item.kind === 'topic' || (!item.ref && item.topic)) {
    if (typeof item.title === 'string') { return item.title; }
    const title = item.title || {};
    return title[lang] || title.en || title.he || item.topic || '';
  }
  return (lang === 'he' && item.heRef) || item.ref || '';
}

export const topicPath = (slug) => `/topics/${slug}`;

/**
 * The notable sources of a topic (curated first, then the strongest), as refs, for turning a
 * topic inbox item into plan units or lesson sources. Resolves to `[]` when the topic has none
 * or the API fails.
 */
export function topicSourceRefs(slug, { limit = 5, lang = 'en' } = {}) {
  if (!slug || typeof Sefaria.getTopic !== 'function') { return Promise.resolve([]); }
  return Promise.resolve(Sefaria.getTopic(slug, { annotated: true }))
    .then(data => {
      const tabs = (data && data.tabs) || {};
      const refs = (tabs['notable-sources'] && tabs['notable-sources'].refs) || (tabs.sources && tabs.sources.refs) || [];
      return sortRefs(refs, 'relevance', lang).map(r => r.ref).filter(Boolean).slice(0, limit);
    })
    .catch(() => []);
}

/** A lesson source for a ref, with its text when the API answers (the handout needs it); the bare ref otherwise. */
export function lessonSourceFor(ref, { heRef = '', note = '' } = {}) {
  return fetchPreview(ref, { maxChars: 1500 })
    .then(p => ({ ref: p.ref, title: p.ref, heTitle: p.heRef || heRef, he: p.he, en: p.en, category: p.category, note }))
    .catch(() => ({ ref, title: ref, heTitle: heRef, note }));
}
