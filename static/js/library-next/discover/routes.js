/**
 * Route registry for the `discover` feature (owned by the `discover` agent). Imported by ../routes.js.
 * Registers `search` (/search?q=), `topics` (/topics) and `topic` (/topics/*: a topic, a
 * category under /topics/category/<slug>, or the landing for /topics/all*).
 */
import React from 'react';
import { registerRoute } from '../router';
import { t } from '../i18n';
import SearchPage from './SearchPage';
import TopicsPage from './TopicsPage';
import TopicPage, { topicTitle } from './TopicPage';
import TopicCategoryPage from './TopicCategoryPage';
import { findCategory } from './topicsModel';
import { pick } from '../i18n';
import './strings';

/** `/topics/*` → `{ kind: 'topic' | 'category' | 'all', slug }`. */
export function parseTopicRest(rest = '') {
  const parts = String(rest).split('/').filter(Boolean);
  if (parts[0] === 'category' && parts[1]) { return { kind: 'category', slug: parts[1] }; }
  if (parts[0] === 'all') { return { kind: 'all', slug: parts[1] || '' }; }
  return { kind: 'topic', slug: parts[0] || '' };
}

export function TopicRoute({ params }) {
  const { kind, slug } = parseTopicRest(params.rest);
  if (kind === 'category') { return <TopicCategoryPage slug={slug} />; }
  if (kind === 'all' || !slug) { return <TopicsPage />; }
  return <TopicPage slug={slug} />;
}

registerRoute({ name: 'search', path: '/search', component: SearchPage, title: () => t('search.title') });
registerRoute({ name: 'topics', path: '/topics', component: TopicsPage, title: () => t('topics.title') });
registerRoute({
  name: 'topic',
  path: '/topics/*',
  component: TopicRoute,
  title: (params) => {
    const { kind, slug } = parseTopicRest(params.rest);
    if (kind === 'category') { const node = findCategory(slug); return node ? pick(node.primaryTitle || { en: node.en, he: node.he }) : slug; }
    if (kind === 'all' || !slug) { return t('topics.title'); }
    return topicTitle(slug);
  },
});
