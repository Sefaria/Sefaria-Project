/**
 * /topics — the topics landing. Blocks are ordered by persona: newcomers get curated starter
 * topics with explainers, learners their recent topics and what is trending, educators the
 * week's parasha and holiday, scholars categories with counts and the A–Z index.
 */
import React, { useEffect, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { useT, pick } from '../i18n';
import { Link, navigate } from '../router';
import { usePersona } from '../persona';
import { useKv } from '../store';
import { STARTER_TOPICS, topicCategories, firstSentence, alphabetize, topicUrl, categoryUrl, refUrl } from './topicsModel';
import './styles.css';

const TOPIC_TYPES = new Set(['Topic', 'PersonTopic', 'AuthorTopic']);
const EMPTY = [];   // stable useKv fallback
const fmt = n => (typeof n === 'number' ? n.toLocaleString() : n);

/** Promise → `[value, state]` with a `live` guard; `deps` restart it. Data-layer calls return jQuery thenables (no `.catch`): wrap them in `Promise.resolve` first. */
function useAsync(make, deps) {
  const [out, setOut] = useState({ value: null, state: 'loading' });
  useEffect(() => {
    let live = true;
    setOut({ value: null, state: 'loading' });
    Promise.resolve().then(make).then(v => { if (live) { setOut({ value: v, state: 'done' }); } }).catch(() => { if (live) { setOut({ value: null, state: 'error' }); } });
    return () => { live = false; };
  }, deps);   // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

const descOf = (topic, lang) => {
  const d = topic && topic.description;
  return d ? (d[lang] || d.en || d.he || '') : '';
};

export function TopicCard({ topic, lang, t, explain = false }) {
  const desc = descOf(topic, lang);
  return (
    <article className="ln-card ln-topic-card">
      <h3><Link to={topicUrl(topic.slug)}>{pick(topic.primaryTitle || { en: topic.en, he: topic.he })}</Link></h3>
      {desc && <p>{firstSentence(desc, explain ? 220 : 120)}</p>}
      {typeof topic.numSources === 'number' && <span className="ln-note">{t('topics.sources', { n: fmt(topic.numSources) })}</span>}
    </article>
  );
}

function Section({ title, children, aside }) {
  return (
    <section className="ln-topics-section">
      <div className="ln-topics-section-head"><h2>{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

function Skeleton({ n = 3 }) {
  return <div className="ln-disc-skeleton" aria-busy="true">{Array.from({ length: n }, (_, i) => <span key={i} className={`ln-skeleton-line ${i % 3 === 2 ? 'short' : ''}`} />)}</div>;
}

function TopicFinder({ t }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2 || !Sefaria.getName) { setItems([]); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      Promise.resolve(Sefaria.getName(q, 10)).then(d => {
        if (!live) { return; }
        setItems((d && d.completion_objects || []).filter(o => TOPIC_TYPES.has(o.type)).slice(0, 8));
      }).catch(() => { if (live) { setItems([]); } });
    }, 180);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);
  const submit = (e) => { e.preventDefault(); if (items[0]) { navigate(topicUrl(items[0].key)); } };
  return (
    <form className="ln-topics-finder" role="search" onSubmit={submit}>
      <label className="ln-sr-only" htmlFor="ln-topic-finder">{t('topics.searchTopics')}</label>
      <input id="ln-topic-finder" className="ln-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('topics.searchTopics')} autoComplete="off" />
      {q.trim().length >= 2 && items.length > 0 && (
        <div className="ln-topics-finder-list" role="listbox">
          {items.map(o => <Link key={o.key} to={topicUrl(o.key)} role="option" aria-selected="false" onClick={() => setQ('')}>{o.title}</Link>)}
        </div>
      )}
      {q.trim().length >= 2 && items.length === 0 && <p className="ln-note" style={{ marginBlockStart: 'var(--ln-space-2)' }}>{t('topics.noMatch', { q })}</p>}
    </form>
  );
}

function Starter({ t, lang }) {
  const { value, state } = useAsync(() => Promise.all(STARTER_TOPICS.map(slug => Promise.resolve(Sefaria.getTopic ? Sefaria.getTopic(slug, { annotated: false }) : null).catch(() => null))), []);
  return (
    <Section title={t('topics.starter')}>
      <p className="ln-disc-lead">{t('topics.starterIntro')}</p>
      {state === 'loading' ? <Skeleton n={4} /> : (
        <div className="ln-topics-grid">{(value || []).filter(Boolean).map(topic => <TopicCard key={topic.slug} topic={topic} lang={lang} t={t} explain />)}</div>
      )}
    </Section>
  );
}

function Featured({ t, lang }) {
  const { value, state } = useAsync(() => (Sefaria.getFeaturedTopic ? Sefaria.getFeaturedTopic() : Promise.resolve(null)), []);
  const topic = value && value.topic;
  if (state === 'loading') { return <Section title={t('topics.featured')}><Skeleton /></Section>; }
  if (!topic) { return null; }
  const img = topic.image && topic.image.image_uri;
  return (
    <Section title={t('topics.featured')}>
      <div className={`ln-featured ${img ? 'has-image' : ''}`}>
        <div>
          <h3><Link to={topicUrl(topic.slug)}>{pick(topic.primaryTitle)}</Link></h3>
          <p>{firstSentence(descOf(topic, lang), 320)}</p>
          <Link className="ln-btn ln-btn-primary" to={topicUrl(topic.slug)}>{pick(topic.primaryTitle)} →</Link>
        </div>
        {img && <img src={img} alt={pick(topic.image.image_caption) || ''} loading="lazy" />}
      </div>
    </Section>
  );
}

function Trending({ t, lang, n = 8 }) {
  const { value, state } = useAsync(() => (Sefaria.getTrendingLibraryTopics ? Sefaria.getTrendingLibraryTopics(n) : Promise.resolve([])), [n]);
  if (state === 'done' && !(value && value.length)) { return null; }
  return (
    <Section title={t('topics.trending')}>
      {state === 'loading' ? <Skeleton /> : <div className="ln-topics-grid">{value.map(topic => <TopicCard key={topic.slug} topic={topic} lang={lang} t={t} />)}</div>}
    </Section>
  );
}

function Categories({ t, lang, withCounts }) {
  const cats = topicCategories();
  if (!cats.length) { return null; }
  return (
    <Section title={t('topics.categories')}>
      <div className="ln-topics-grid">
        {cats.map(c => (
          <article key={c.slug} className="ln-card ln-topic-card">
            <h3><Link to={categoryUrl(c.slug)}>{pick(c.title)}</Link></h3>
            {(c.description[lang] || c.description.en) && <p>{c.description[lang] || c.description.en}</p>}
            {withCounts && <span className="ln-note">{t('topics.categoryCount', { n: c.count })}</span>}
          </article>
        ))}
      </div>
    </Section>
  );
}

function Random({ t, lang }) {
  const [seed, setSeed] = useState(0);
  const { value, state } = useAsync(() => (Sefaria.getTopicsByPool ? Sefaria.getTopicsByPool(Sefaria.getLangSpecificTopicPoolName ? Sefaria.getLangSpecificTopicPoolName('general') : `general_${lang}`, 4, 'random') : Promise.resolve([])), [seed]);
  if (state === 'done' && !(value && value.length)) { return null; }
  return (
    <Section title={t('topics.random')} aside={<button type="button" className="ln-btn ln-btn-quiet" onClick={() => setSeed(s => s + 1)}>{t('topics.shuffle')}</button>}>
      {state === 'loading' ? <Skeleton /> : <div className="ln-topics-grid">{value.map(topic => <TopicCard key={topic.slug} topic={topic} lang={lang} t={t} />)}</div>}
    </Section>
  );
}

function Recent({ t }) {
  const [recent] = useKv('recentTopics', EMPTY);
  if (!recent || !recent.length) { return null; }
  return (
    <Section title={t('topics.recent')}>
      <div className="ln-chip-row" style={{ marginBlockStart: 'var(--ln-space-3)' }}>
        {recent.map(r => <Link key={r.slug} className="ln-chip-link" to={topicUrl(r.slug)}>{pick(r.title)}</Link>)}
      </div>
    </Section>
  );
}

function ForClass({ t, lang }) {
  const { value, state } = useAsync(() => Promise.all(['parasha', 'holiday'].map(d => Promise.resolve(Sefaria.getUpcomingDay ? Sefaria.getUpcomingDay(d) : null).catch(() => null))), []);
  if (state === 'loading') { return <Section title={t('topics.forClass')}><Skeleton /></Section>; }
  const [parasha, holiday] = value || [];
  const holidayTopic = holiday && (holiday.topic || holiday);
  if (!parasha && !holidayTopic) { return null; }
  return (
    <Section title={t('topics.forClass')}>
      <div className="ln-topics-grid">
        {parasha && parasha.displayValue && (
          <article className="ln-card ln-topic-card">
            <span className="ln-note">{t('topics.parasha')}</span>
            <h3>{parasha.topic ? <Link to={topicUrl(parasha.topic.slug)}>{pick(parasha.displayValue)}</Link> : <Link to={refUrl(parasha.ref)}>{pick(parasha.displayValue)}</Link>}</h3>
            {parasha.description && <p>{firstSentence(parasha.description[lang] || parasha.description.en, 200)}</p>}
            {parasha.ref && <Link className="ln-note" to={refUrl(parasha.ref)}>{lang === 'he' ? parasha.heRef : parasha.ref}</Link>}
          </article>
        )}
        {holidayTopic && holidayTopic.slug && (
          <article className="ln-card ln-topic-card">
            <span className="ln-note">{t('topics.holiday')}</span>
            <h3><Link to={topicUrl(holidayTopic.slug)}>{pick(holidayTopic.primaryTitle)}</Link></h3>
            <p>{firstSentence(descOf(holidayTopic, lang), 200)}</p>
          </article>
        )}
      </div>
    </Section>
  );
}

function AZ({ t, lang }) {
  const [wanted, setWanted] = useState(false);
  const { value, state } = useAsync(() => (wanted && Sefaria.topicList ? Sefaria.topicList() : Promise.resolve(null)), [wanted]);
  const groups = value ? alphabetize(value, lang) : [];
  return (
    <Section title={t('topics.az')} aside={value && <span className="ln-note">{t('topics.azCount', { n: fmt(groups.reduce((n, g) => n + g.topics.length, 0)) })}</span>}>
      {!wanted && <div style={{ marginBlockStart: 'var(--ln-space-3)' }}><button type="button" className="ln-btn" onClick={() => setWanted(true)}>{t('topics.azLoad')}</button></div>}
      {wanted && state === 'loading' && <p className="ln-note" style={{ marginBlockStart: 'var(--ln-space-3)' }}>{t('topics.azLoading')}</p>}
      {groups.length > 0 && (
        <div className="ln-az">
          <nav className="ln-az-letters" aria-label={t('topics.az')}>{groups.map(g => <a key={g.letter} href={`#ln-az-${encodeURIComponent(g.letter)}`}>{g.letter}</a>)}</nav>
          <div className="ln-az-columns">
            {groups.map(g => (
              <div key={g.letter} className="ln-az-group" id={`ln-az-${encodeURIComponent(g.letter)}`}>
                <h3>{g.letter}</h3>
                {g.topics.map(x => <Link key={x.slug} to={topicUrl(x.slug)}>{pick(x.title)}<span className="ln-count">{fmt(x.numSources)}</span></Link>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

const ORDER = {
  newcomer: ['starter', 'featured', 'categories'],
  learner: ['recent', 'trending', 'featured', 'categories', 'random'],
  educator: ['forClass', 'trending', 'featured', 'categories'],
  scholar: ['categories', 'az', 'trending'],
};

export default function TopicsPage() {
  const { t, lang } = useT();
  const { persona } = usePersona();
  const blocks = {
    starter: <Starter key="starter" t={t} lang={lang} />,
    featured: <Featured key="featured" t={t} lang={lang} />,
    trending: <Trending key="trending" t={t} lang={lang} n={persona === 'scholar' ? 4 : 8} />,
    categories: <Categories key="categories" t={t} lang={lang} withCounts={persona === 'scholar'} />,
    random: <Random key="random" t={t} lang={lang} />,
    recent: <Recent key="recent" t={t} />,
    forClass: <ForClass key="forClass" t={t} lang={lang} />,
    az: <AZ key="az" t={t} lang={lang} />,
  };
  return (
    <section className="ln-container ln-topics-page" data-persona={persona}>
      <div className="ln-disc-head">
        <div>
          <h1 className="ln-page-title">{t('topics.title')}</h1>
          <p className="ln-disc-lead">{t('topics.intro')}</p>
        </div>
      </div>
      <TopicFinder t={t} />
      {(ORDER[persona] || ORDER.newcomer).map(id => blocks[id])}
    </section>
  );
}
