/** /topics/category/<slug> — the topics (and subcategories) under one topic-TOC category. */
import React from 'react';
import { useT, pick } from '../i18n';
import { Link } from '../router';
import { findCategory, categoryChildren, topicUrl, categoryUrl } from './topicsModel';
import './styles.css';

export default function TopicCategoryPage({ slug }) {
  const { t, lang } = useT();
  const node = findCategory(slug);
  const children = categoryChildren(slug);
  const title = node ? pick(node.primaryTitle || { en: node.en, he: node.he }) : slug;
  const desc = node && node.categoryDescription && (node.categoryDescription[lang] || node.categoryDescription.en);
  return (
    <section className="ln-container ln-topics-page">
      <p className="ln-topic-crumbs"><Link to="/topics">{t('topics.backToTopics')}</Link></p>
      <h1 className="ln-page-title">{node ? t('topics.categoryTitle', { cat: title }) : t('topic.notFound', { slug })}</h1>
      {desc && <p className="ln-disc-lead">{desc}</p>}
      {node && <p className="ln-note">{t('topics.categoryCount', { n: children.length })}</p>}
      <div className="ln-topics-grid">
        {children.map(c => (
          <article key={c.slug} className="ln-card ln-topic-card">
            <h3><Link to={c.isCategory ? categoryUrl(c.slug) : topicUrl(c.slug)}>{pick(c.title)}</Link></h3>
            {(c.description[lang] || c.description.en) && <p>{c.description[lang] || c.description.en}</p>}
            <span className="ln-note">{c.isCategory ? t('topics.categoryCount', { n: c.count }) : (c.count ? t('topics.sources', { n: c.count.toLocaleString() }) : '')}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
