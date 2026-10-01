/**
 * What the discover pages write for each persona. The my-library agent owns the collection
 * schemas (PLAN.md); until a "current lesson draft" / plan / notebook entry model exists, these
 * land in kv inbox lists that My Library can drain: `savedSearches`, `lessonInbox`,
 * `planInbox`, `notebookInbox`, plus `recentTopics` for the topics landing.
 */
import { kv } from '../store';

const CAPS = { savedSearches: 50, lessonInbox: 200, planInbox: 100, notebookInbox: 200, recentTopics: 12 };

function pushUnique(key, item, matchKey) {
  const list = kv.get(key, []) || [];
  const rest = list.filter(x => x[matchKey] !== item[matchKey]);
  const next = [{ ...item, ts: Date.now() }, ...rest].slice(0, CAPS[key] || 100);
  kv.set(key, next);
  return next;
}

export function listKv(key) { return kv.get(key, []) || []; }

export function saveSearch({ url, q, exact, sort, paths }) {
  return pushUnique('savedSearches', { url, q, exact: !!exact, sort, paths: paths || [] }, 'url');
}
export function isSearchSaved(url) { return listKv('savedSearches').some(s => s.url === url); }
export function forgetSearch(url) { kv.set('savedSearches', listKv('savedSearches').filter(s => s.url !== url)); }

/** Educator: a source for the lesson being built. `{ ref, heRef, title?, snippet?, topic?, from }`. */
export function addToLessonInbox(item) { return pushUnique('lessonInbox', { kind: item.ref ? 'ref' : 'topic', ...item }, item.ref ? 'ref' : 'topic'); }
export function inLessonInbox(ref) { return listKv('lessonInbox').some(x => x.ref === ref); }

/** Learner: a topic (or ref) to fold into a study plan. */
export function addToPlanInbox(item) { return pushUnique('planInbox', { kind: item.ref ? 'ref' : 'topic', ...item }, item.ref ? 'ref' : 'topic'); }
export function inPlanInbox(topic) { return listKv('planInbox').some(x => x.topic === topic); }

/** Scholar: a topic (or ref) for the research notebook. */
export function addToNotebookInbox(item) { return pushUnique('notebookInbox', { kind: item.ref ? 'ref' : 'topic', ...item }, item.ref ? 'ref' : 'topic'); }
export function inNotebookInbox(topic) { return listKv('notebookInbox').some(x => x.topic === topic); }

export function rememberTopic(slug, title) { return pushUnique('recentTopics', { slug, title }, 'slug'); }
export function recentTopics() { return listKv('recentTopics'); }

/** Client-side file download (CSV export). */
export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  if (typeof document === 'undefined') { return; }
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
