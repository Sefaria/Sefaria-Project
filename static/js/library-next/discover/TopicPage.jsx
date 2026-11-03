/**
 * /topics/<slug> — one topic: title, description, image, source tabs (notable / all / top
 * citations) with text previews in the content language, related topics, persona actions.
 * Data: `Sefaria.getTopic(slug)` (v2 topics API with refs + links) and `Sefaria.getBulkText`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { useT, pick, t as tt } from '../i18n';
import { Link } from '../router';
import { usePersona } from '../persona';
import { useContentLang } from '../contentLang';
import { toast } from '../overlays';
import { useKv } from '../store';
import { sortRefs, isNotable, sourceTabs, relatedGroups, plainText, categoryChildren, topicUrl, categoryUrl, refUrl } from './topicsModel';
import { addToLessonInbox, addToPlanInbox, addToNotebookInbox, rememberTopic } from './personaActions';
import './styles.css';

const PAGE = 10;
const EMPTY = [];   // stable fallback: a fresh [] per render would re-subscribe useKv every render
const catColor = cat => (Sefaria.palette && Sefaria.palette.categoryColor ? Sefaria.palette.categoryColor(cat) : undefined);
const fmt = n => (typeof n === 'number' ? n.toLocaleString() : n);

export function prettySlug(slug) {
  return String(slug || '').split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** Document title for the route: the cached topic title, else the slug. */
export function topicTitle(slug) {
  const cached = Sefaria.getTopicFromCache ? Sefaria.getTopicFromCache(slug) : null;
  return cached && cached.primaryTitle ? pick(cached.primaryTitle) : prettySlug(slug);
}

function useTopic(slug) {
  const [state, setState] = useState({ data: null, status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ data: null, status: 'loading' });
    if (!Sefaria.getTopic) { setState({ data: null, status: 'error' }); return undefined; }
    Promise.resolve(Sefaria.getTopic(slug)).then(data => {
      if (!live) { return; }
      if (!data || data.error) { setState({ data: null, status: 'missing' }); return; }
      setState({ data, status: 'done' });
      rememberTopic(slug, data.primaryTitle || { en: slug, he: slug });
      if (typeof document !== 'undefined') { document.title = `${pick(data.primaryTitle)} | ${tt('site.name')}`; }
    }).catch(() => { if (live) { setState({ data: null, status: 'error' }); } });
    return () => { live = false; };
  }, [slug]);
  return state;
}

const bulk = refs => Promise.resolve(Sefaria.getBulkText(refs, true, 300, 420));

/**
 * Text previews for the refs on the current page, via the bulk text API. When the batch fails
 * (one odd ref can sink it), each ref is fetched on its own; a ref with no text is stored as
 * `null` so its card shows no skeleton.
 */
export function fetchTexts(refs) {
  if (!refs.length || !Sefaria.getBulkText) { return Promise.resolve({}); }
  return bulk(refs)
    .catch(() => Promise.all(refs.map(r => bulk([r]).catch(() => ({})))).then(parts => Object.assign({}, ...parts)))
    .then(d => { const out = { ...(d || {}) }; refs.forEach(r => { if (!(r in out)) { out[r] = null; } }); return out; });
}

function useTexts(refs) {
  const [texts, setTexts] = useState({});
  const key = refs.join('|');
  useEffect(() => {
    let live = true;
    fetchTexts(refs).then(d => { if (live) { setTexts(prev => ({ ...prev, ...d })); } });
    return () => { live = false; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return texts;
}

function Preview({ text, contentLang }) {
  if (text === null) { return null; }   // fetched, nothing to show
  if (!text) { return <div className="ln-disc-skeleton"><span className="ln-skeleton-line" /><span className="ln-skeleton-line short" /></div>; }
  const he = text.he && <div className="ln-preview-he" lang="he" dangerouslySetInnerHTML={{ __html: text.he }} />;
  const en = text.en && <div className="ln-preview-en" lang="en" dangerouslySetInnerHTML={{ __html: text.en }} />;
  if (contentLang === 'he') { return he || en || null; }
  if (contentLang === 'en') { return en || he || null; }
  return <div className="ln-source-texts">{he}{en}</div>;
}

function Source({ item, text, lang, contentLang, persona, t, topicName, inLesson, onLesson }) {
  const note = item.descriptions && (item.descriptions[lang] || item.descriptions.en || item.descriptions.he);
  const showNote = note && (note.title || note.prompt) && note.published !== false;
  const heRef = (text && text.heRef) || item.ref;
  const both = contentLang === 'bi' && heRef !== item.ref;   // no Hebrew title known: show the ref once
  const refNode = contentLang === 'he' ? <span className="he" lang="he">{heRef}</span>
    : !both ? <span lang="en">{item.ref}</span>
      : (lang === 'he' ? <><span className="he" lang="he">{heRef}</span> · <span lang="en">{item.ref}</span></> : <><span lang="en">{item.ref}</span> · <span className="he" lang="he">{heRef}</span></>);
  const cat = text && text.primary_category;
  return (
    <article className="ln-source ln-cat-rule" style={{ '--cat': catColor(cat) }}>
      <div className="ln-source-head">
        <h3 className="ln-source-ref"><Link to={refUrl(item.ref)}>{refNode}</Link></h3>
        {cat && <span className="ln-sr-path">{lang === 'he' && Sefaria.hebrewTerm ? Sefaria.hebrewTerm(cat) : cat}</span>}
      </div>
      {showNote && (
        <div className="ln-source-note">
          {note.title && <h3>{note.title.trim()}</h3>}
          {note.prompt && <p>{plainText(note.prompt)}</p>}
        </div>
      )}
      <Preview text={text} contentLang={contentLang} />
      {persona === 'educator' && (
        <p className="ln-prompt"><strong>{t('topic.discussionPrompt')}:</strong> {t('topic.discussionTemplate', { topic: topicName })} <span className="ln-badge-simulated">{t('search.simulated')}</span></p>
      )}
      <div className="ln-source-foot">
        <Link className="ln-btn" to={refUrl(item.ref)}>{t('topic.open')}</Link>
        {persona === 'educator' && <button type="button" className="ln-btn" disabled={inLesson} onClick={() => onLesson(item, text)}>{inLesson ? t('topic.addedToLesson') : t('topic.addSourceToLesson')}</button>}
        {persona === 'scholar' && item.order && typeof item.order.comp_date === 'number' && <span>{item.order.comp_date < 0 ? `${-item.order.comp_date} BCE` : item.order.comp_date}</span>}
      </div>
    </article>
  );
}

export default function TopicPage({ slug }) {
  const { t, lang } = useT();
  const { persona } = usePersona();
  const [contentLang] = useContentLang();
  const { data, status } = useTopic(slug);
  const [lessonInbox] = useKv('lessonInbox', EMPTY);
  const [planInbox] = useKv('planInbox', EMPTY);
  const [notebookInbox] = useKv('notebookInbox', EMPTY);

  const tabs = useMemo(() => sourceTabs(data), [data]);
  const defaultTab = persona === 'scholar' ? (tabs.find(x => x.id === 'sources') || tabs[0]) : tabs[0];
  const [tabId, setTabId] = useState(null);
  const [sort, setSort] = useState('relevance');
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setTabId(null); setShown(PAGE); }, [slug]);
  const tab = tabs.find(x => x.id === tabId) || defaultTab;

  const sorted = useMemo(() => (tab ? sortRefs(tab.refs, sort, lang) : []), [tab, sort, lang]);
  const page = sorted.slice(0, shown);
  const texts = useTexts(page.map(r => r.ref));

  if (status === 'loading') {
    return (
      <section className="ln-container ln-topic-page">
        <p className="ln-topic-crumbs"><Link to="/topics">{t('topics.backToTopics')}</Link></p>
        <h1 className="ln-page-title">{prettySlug(slug)}</h1>
        <div className="ln-disc-skeleton" aria-busy="true" aria-label={t('topic.loading')}><span className="ln-skeleton-line" /><span className="ln-skeleton-line" /><span className="ln-skeleton-line short" /></div>
      </section>
    );
  }
  if (status !== 'done') {
    return (
      <section className="ln-container ln-topic-page">
        <p className="ln-topic-crumbs"><Link to="/topics">{t('topics.backToTopics')}</Link></p>
        <h1 className="ln-page-title">{prettySlug(slug)}</h1>
        <p className="ln-disc-empty">{status === 'missing' ? t('topic.notFound', { slug }) : t('search.error')}</p>
        <a className="ln-btn" href={`/topics/${slug}?library=classic`}>{t('topics.openClassic')}</a>
      </section>
    );
  }

  const title = pick(data.primaryTitle);
  const altLang = lang === 'he' ? 'en' : 'he';
  const alt = data.primaryTitle && data.primaryTitle[altLang] && data.primaryTitle[altLang] !== title ? data.primaryTitle[altLang] : null;
  const desc = data.description && (data.description[lang] || data.description.en || data.description.he);
  const category = Sefaria.displayTopicTocCategory ? Sefaria.displayTopicTocCategory(slug) : null;
  const img = data.image && data.image.image_uri;
  const related = relatedGroups(data.links);
  const subtopics = categoryChildren(slug);
  const period = data.timePeriod;
  const wiki = data.properties && ((lang === 'he' && data.properties.heWikiLink) || data.properties.enWikiLink);

  const topicItem = { topic: slug, title: data.primaryTitle, from: 'topic' };
  const inPlan = (planInbox || []).some(x => x.topic === slug);
  const inLesson = (lessonInbox || []).some(x => x.topic === slug);
  const inNotebook = (notebookInbox || []).some(x => x.topic === slug);
  const onLesson = (item, text) => {
    addToLessonInbox({ ref: item.ref, heRef: text && text.heRef, topic: slug, title: data.primaryTitle, from: 'topic' });
    toast(t('topic.addedToLesson'));
  };

  return (
    <section className="ln-container ln-topic-page" data-persona={persona}>
      <p className="ln-topic-crumbs">
        <Link to="/topics">{t('topics.backToTopics')}</Link>
        {category && category.slug !== slug && <><span aria-hidden="true">›</span><Link to={categoryUrl(category.slug)}>{pick(category.primaryTitle || { en: category.en, he: category.he })}</Link></>}
      </p>
      <header className={`ln-topic-header ${img ? 'has-image' : ''}`}>
        <div>
          <div className="ln-topic-title">
            <h1>{title}</h1>
            {alt && <span className={`ln-topic-title-alt ${altLang}`} lang={altLang}>{alt}</span>}
          </div>
          {desc && <p className="ln-topic-desc">{plainText(desc)}</p>}
          <div className="ln-topic-meta">
            {typeof data.numSources === 'number' && <span>{t('topics.sources', { n: fmt(data.numSources) })}</span>}
            {period && period.name && <span>{t('topic.timePeriod')} {pick(period.name)}{period.yearRange ? ` (${period.yearRange.start}–${period.yearRange.end})` : ''}</span>}
            {persona === 'scholar' && related.length > 0 && <span>{t('topic.linkCount', { n: related.reduce((n, g) => n + g.topics.length, 0) })}</span>}
            {persona === 'scholar' && wiki && <a href={wiki.value} target="_blank" rel="noopener noreferrer">{t('topic.wikipedia')}</a>}
          </div>
          <div className="ln-disc-actions" style={{ marginBlockStart: 'var(--ln-space-3)' }}>
            {persona === 'learner' && <button type="button" className="ln-btn ln-btn-primary" disabled={inPlan} onClick={() => { addToPlanInbox(topicItem); toast(t('topic.addedToPlan')); }}>{inPlan ? t('topic.addedToPlan') : t('topic.addToPlan')}</button>}
            {persona === 'educator' && <button type="button" className="ln-btn ln-btn-primary" disabled={inLesson} onClick={() => { addToLessonInbox(topicItem); toast(t('topic.addedToLesson')); }}>{inLesson ? t('topic.addedToLesson') : t('topic.addToLesson')}</button>}
            {persona === 'scholar' && <button type="button" className="ln-btn ln-btn-primary" disabled={inNotebook} onClick={() => { addToNotebookInbox({ ...topicItem, citation: `${title}. Sefaria. ${typeof window !== 'undefined' ? window.location.origin : 'https://www.sefaria.org'}${topicUrl(slug)}`, text: plainText(desc) }); toast(t('topic.addedToNotebook')); }}>{inNotebook ? t('topic.addedToNotebook') : t('topic.addToNotebook')}</button>}
            <a className="ln-btn ln-btn-quiet" href={`/topics/${slug}?library=classic`}>{t('topics.openClassic')}</a>
          </div>
        </div>
        {img && (
          <figure className="ln-topic-figure">
            <img src={img} alt={pick(data.image.image_caption) || title} loading="lazy" />
            {data.image.image_caption && <figcaption>{plainText(pick(data.image.image_caption))}</figcaption>}
          </figure>
        )}
      </header>

      <div className="ln-topic-layout">
        <div>
          {persona === 'newcomer' && tabs.length > 0 && (
            <aside className="ln-explainer">
              <span className="ln-explainer-label">{t('topic.explainerTitle')}</span>
              <p>{t('topic.explainerBody')}</p>
            </aside>
          )}
          {tabs.length === 0 ? <p className="ln-disc-empty">{t('topic.noSources')}</p> : (
            <>
              <div className="ln-topic-tabs">
                <div className="ln-tablist" role="tablist">
                  {tabs.map(x => (
                    <button key={x.id} type="button" role="tab" className="ln-tab" aria-selected={tab && tab.id === x.id} onClick={() => { setTabId(x.id); setShown(PAGE); }}>
                      {t(x.key)}<span className="ln-count">{fmt(x.refs.length)}</span>
                    </button>
                  ))}
                </div>
                {persona !== 'newcomer' && (
                  <label className="ln-row">
                    <span className="ln-small">{t('search.sort')}</span>
                    <select className="ln-inline-select" value={sort} onChange={e => setSort(e.target.value)}>
                      <option value="relevance">{t('topic.sortRelevance')}</option>
                      <option value="chronological">{t('topic.sortChronological')}</option>
                    </select>
                  </label>
                )}
              </div>
              <div className="ln-sources" role="tabpanel">
                {page.map(item => (
                  <Source key={item.ref} item={item} text={texts[item.ref]} lang={lang} contentLang={contentLang} persona={persona} t={t} topicName={title}
                          inLesson={(lessonInbox || []).some(x => x.ref === item.ref)} onLesson={onLesson} />
                ))}
              </div>
              {shown < sorted.length && (
                <div className="ln-topic-more"><button type="button" className="ln-btn" onClick={() => setShown(s => s + PAGE)}>{t('topic.showMore')}</button></div>
              )}
            </>
          )}
        </div>
        <aside className="ln-topic-side">
          {subtopics.length > 0 && (
            <div>
              <h2>{t('topic.subtopics')}</h2>
              <div className="ln-chip-row">{subtopics.slice(0, 24).map(s => <Link key={s.slug} className="ln-chip-link" to={s.isCategory ? categoryUrl(s.slug) : topicUrl(s.slug)}>{pick(s.title)}</Link>)}</div>
            </div>
          )}
          {related.length > 0 && (
            <div>
              <h2>{t('topic.related')}</h2>
              {related.slice(0, persona === 'newcomer' ? 2 : 6).map(g => (
                <div key={g.type} className="ln-related-group">
                  <h3>{pick(g.title)}</h3>
                  <div className="ln-chip-row">{g.topics.map(x => <Link key={x.slug} className="ln-chip-link" to={topicUrl(x.slug)}>{pick(x.title)}</Link>)}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
