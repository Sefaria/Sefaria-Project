/**
 * /search?q=… — library search over the classic path (`Sefaria.search.execute_query` →
 * POST /api/search-wrapper/es8). State lives in the URL (q, exact, sort, path, lang, era, version);
 * editing in the page replaces the history entry. Persona decides how much of the controls show.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { useT, pick } from '../i18n';
import { Link, navigate } from '../router';
import { usePersona } from '../persona';
import { useContentLang } from '../contentLang';
import { toast } from '../overlays';
import { useKv } from '../store';
import {
  parseSearchParams, buildSearchUrl, serverKey, queryArgs, mergeHits, collapseVersions, hitToResult, buildFacetTree,
  togglePath, applyClientFilters, versionsIn, resultsToCsv, totalOf, ERAS, GRADES, gradeOf, PAGE_SIZE,
} from './searchModel';
import { saveSearch, forgetSearch, addToLessonInbox, downloadText } from './personaActions';
import { plainText, firstSentence, topicUrl } from './topicsModel';
import './styles.css';

const TOPIC_TYPES = new Set(['Topic', 'PersonTopic', 'AuthorTopic']);
const EMPTY = [];   // stable useKv fallback
const catColor = cat => (Sefaria.palette && Sefaria.palette.categoryColor ? Sefaria.palette.categoryColor(cat) : undefined);
const fmt = n => (typeof n === 'number' ? n.toLocaleString() : n);

/** Runs the server query for `state`; returns `{ hits, total, facets, status, loadMore, hasMore, retry }`. */
function useSearch(state, { facetDepth }) {
  const [data, setData] = useState({ hits: [], total: { value: 0, exact: true }, facets: null, status: state.q ? 'loading' : 'idle', exhausted: false });
  const seq = useRef(0);
  const key = serverKey(state);
  const run = (start) => {
    if (!state.q) { setData(d => ({ ...d, hits: [], status: 'idle' })); return; }
    const search = Sefaria.search;
    if (!search || typeof search.execute_query !== 'function') { setData(d => ({ ...d, status: 'error' })); return; }
    const mine = ++seq.current;
    setData(d => ({ ...d, status: start ? 'more' : 'loading', ...(start ? {} : { hits: [], exhausted: false }) }));
    search.execute_query(queryArgs(state, {
      start,
      size: PAGE_SIZE,
      withAggs: start === 0,
      success: (res) => {
        if (mine !== seq.current) { return; }
        const incoming = (res && res.hits && res.hits.hits) || [];
        setData(d => {
          const hits = start ? mergeHits(d.hits, incoming) : incoming;
          const buckets = res && res.aggregations && res.aggregations.path && res.aggregations.path.buckets;
          return {
            hits,
            total: totalOf(res),
            facets: buckets ? buildFacetTree(buckets, { maxDepth: facetDepth }) : d.facets,
            status: 'done',
            exhausted: start > 0 && hits.length === d.hits.length,
          };
        });
      },
      error: (err) => {
        if (mine !== seq.current || (err && err.textStatus === 'abort')) { return; }
        setData(d => ({ ...d, status: 'error' }));
      },
    }));
  };
  useEffect(() => { run(0); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const hasMore = !data.exhausted && data.hits.length < data.total.value;
  return { ...data, hasMore, loadMore: () => run(data.hits.length), retry: () => run(0) };
}

/** Newcomer strip: when the query names a topic, say what it is and offer the topic page. */
function TopicExplainer({ q, lang, t }) {
  const [topic, setTopic] = useState(null);
  useEffect(() => {
    let live = true;
    setTopic(null);
    if (!q || q.length < 3 || !Sefaria.getName) { return undefined; }
    Promise.resolve(Sefaria.getName(q, 8)).then(d => {
      const needle = q.trim().toLowerCase();
      const match = (d && d.completion_objects || []).find(o => TOPIC_TYPES.has(o.type) && String(o.title || '').toLowerCase() === needle);
      if (!match || !live || !Sefaria.getTopic) { return null; }
      return Promise.resolve(Sefaria.getTopic(match.key, { annotated: false })).then(data => { if (live && data && !data.error) { setTopic(data); } });
    }).catch(() => {});
    return () => { live = false; };
  }, [q]);
  if (!topic) { return null; }
  const desc = topic.description && (topic.description[lang] || topic.description.en || topic.description.he);
  return (
    <aside className="ln-explainer" aria-label={t('search.topicExplainerLabel')}>
      <span className="ln-explainer-label">{t('search.topicExplainerLabel')}</span>
      <h2>{pick(topic.primaryTitle)}</h2>
      {desc && <p>{firstSentence(desc, 240)}</p>}
      <div><Link className="ln-btn ln-btn-primary" to={topicUrl(topic.slug)}>{t('search.topicExplainerOpen')}</Link></div>
    </aside>
  );
}

function FacetNode({ node, paths, onToggle, lang, depth }) {
  const selected = paths.includes(node.key);
  const hasSelectedChild = paths.some(p => p.startsWith(node.key + '/'));
  const [open, setOpen] = useState(hasSelectedChild);
  useEffect(() => { if (hasSelectedChild) { setOpen(true); } }, [hasSelectedChild]);
  const label = lang === 'he' ? node.heTitle : node.title;
  return (
    <li>
      <div className="ln-facet">
        <label className="ln-facet-label">
          <input type="checkbox" checked={selected} onChange={() => onToggle(node.key)} />
          <span title={label}>{label}</span>
        </label>
        <span className="ln-facet-count">{fmt(node.count)}</span>
        {node.children.length > 0 && depth < 3 && (
          <button type="button" className="ln-facet-toggle" aria-expanded={open} aria-label={label} onClick={() => setOpen(o => !o)}>{open ? '−' : '+'}</button>
        )}
      </div>
      {open && node.children.length > 0 && depth < 3 && (
        <ul className="ln-facets ln-facet-children">
          {node.children.map(c => <FacetNode key={c.key} node={c} paths={paths} onToggle={onToggle} lang={lang} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

function ResultCard({ r, q, t, lang, contentLang, persona, onLesson, inLesson }) {
  const showHe = contentLang !== 'en';
  const showEn = contentLang !== 'he';
  const titleHe = <span className="ln-sr-title-he" lang="he">{r.heRef}</span>;
  const titleEn = <span lang="en">{r.ref}</span>;
  const title = showHe && showEn ? (lang === 'he' ? <>{titleHe} · {titleEn}</> : <>{titleEn} · {titleHe}</>) : (showHe ? titleHe : titleEn);
  const era = ERAS.find(e => e.id === r.era);
  return (
    <article className="ln-sr ln-cat-rule" style={{ '--cat': catColor(r.primaryCategory) }}>
      <div className="ln-sr-head">
        <h3 className="ln-sr-title"><Link to={`${r.url}?qh=${encodeURIComponent(q)}`}>{title}</Link></h3>
        <span className="ln-sr-path">{t('search.inCategory', { cat: r.categories.map(c => (lang === 'he' && Sefaria.hebrewTerm ? Sefaria.hebrewTerm(c) : c)).join(' › ') })}</span>
      </div>
      <div className={`ln-sr-snippet ${r.snippetLang === 'he' ? 'ln-preview-he' : 'ln-preview-en'}`} lang={r.snippetLang} dangerouslySetInnerHTML={{ __html: r.snippetHtml }} />
      <div className="ln-sr-foot">
        {r.version && <span className="ln-sr-version" title={r.version}>{r.version}</span>}
        {persona === 'scholar' && era && <span>{t(era.key)}{r.compDate !== null ? ` · ${r.compDate < 0 ? `${-r.compDate} BCE` : r.compDate}` : ''}</span>}
        {r.duplicates > 0 && <span>{r.duplicates === 1 ? t('search.moreVersion') : t('search.moreVersions', { n: r.duplicates })}</span>}
        {persona === 'educator' && <span className="ln-grade">{t(`search.grade${gradeOf(r.ref).replace(/^./, c => c.toUpperCase())}`)} <span className="ln-badge-simulated">{t('search.simulated')}</span></span>}
        {persona === 'educator' && (
          <button type="button" className="ln-btn" disabled={inLesson} onClick={() => onLesson(r)}>{inLesson ? t('search.addedToLesson') : t('search.addToLesson')}</button>
        )}
      </div>
    </article>
  );
}

export default function SearchPage({ query = {} }) {
  const { t, lang } = useT();
  const { persona } = usePersona();
  const [contentLang] = useContentLang();
  const state = useMemo(() => parseSearchParams(query), [query]);
  const [draft, setDraft] = useState(state.q);
  useEffect(() => { setDraft(state.q); }, [state.q]);
  const [grade, setGrade] = useState('all');
  const [saved] = useKv('savedSearches', EMPTY);
  const [lessonInbox] = useKv('lessonInbox', EMPTY);

  const newcomer = persona === 'newcomer';
  const scholar = persona === 'scholar';
  const { hits, total, facets, status, hasMore, loadMore, retry } = useSearch(state, { facetDepth: newcomer ? 1 : Infinity });

  const update = (patch, { replace = true } = {}) => navigate(buildSearchUrl({ ...state, ...patch }), { replace, scroll: false });
  const submit = (e) => {
    e.preventDefault();
    const q = draft.trim();
    if (q && q !== state.q) { update({ q }, { replace: false }); }
  };

  const results = useMemo(() => collapseVersions(hits).map(hitToResult), [hits]);
  const filtered = useMemo(() => {
    const base = newcomer ? results : applyClientFilters(results, { lang: state.lang, era: scholar ? state.era : '', version: scholar ? state.version : '' });
    return persona === 'educator' && grade !== 'all' ? base.filter(r => gradeOf(r.ref) === grade) : base;
  }, [results, state.lang, state.era, state.version, grade, persona, newcomer, scholar]);
  const versions = useMemo(() => versionsIn(results), [results]);

  const url = buildSearchUrl(state);
  const isSaved = (saved || []).some(s => s.url === url);
  const toggleSave = () => {
    if (isSaved) { forgetSearch(url); return; }
    saveSearch({ url, q: state.q, exact: state.exact, sort: state.sort, paths: state.paths });
    toast(t('search.saved'));
  };
  const onLesson = (r) => {
    addToLessonInbox({ ref: r.ref, heRef: r.heRef, snippet: r.snippetHtml.replace(/<[^>]+>/g, ''), q: state.q, from: 'search' });
    toast(t('search.addedToLesson'));
  };
  const exportCsv = () => {
    downloadText(`sefaria-search-${state.q.replace(/\W+/g, '-').toLowerCase() || 'results'}.csv`, resultsToCsv(filtered, { origin: typeof window !== 'undefined' ? window.location.origin : undefined }));
    toast(t('search.exported', { n: filtered.length }));
  };

  const countLine = () => {
    if (!total.value) { return null; }
    if (!total.exact) { return t('search.countApprox', { n: fmt(total.value) }); }
    return total.value === 1 ? t('search.countOne') : t('search.count', { n: fmt(total.value) });
  };
  const clientFiltered = filtered.length !== results.length;
  const classicHref = `/search?q=${encodeURIComponent(state.q)}&library=classic`;

  return (
    <section className="ln-container ln-search-page">
      <h1 className="ln-page-title">{state.q ? t('search.titleFor', { q: state.q }) : t('search.title')}</h1>
      <form className="ln-search-form" role="search" onSubmit={submit}>
        <label className="ln-sr-only" htmlFor="ln-search-page-input">{t('search.inputLabel')}</label>
        <input id="ln-search-page-input" className="ln-input" type="search" value={draft} onChange={e => setDraft(e.target.value)}
               placeholder={t('search.inputPlaceholder')} autoComplete="off" />
        <button type="submit" className="ln-btn ln-btn-primary">{t('search.go')}</button>
      </form>

      {!state.q && <p className="ln-disc-empty">{t('search.empty')}</p>}

      {state.q && (
        <div className="ln-search-layout">
          <aside className="ln-search-aside" aria-label={t('search.filters')}>
            {!newcomer && (
              <div>
                <label className="ln-check"><input type="checkbox" checked={state.exact} onChange={e => update({ exact: e.target.checked })} /> {t('search.exact')}</label>
              </div>
            )}
            {facets && facets.roots.length > 0 && (
              <div>
                <h2>{t('search.filterCategories')}</h2>
                {newcomer ? (
                  <div className="ln-chip-row">
                    {facets.roots.map(n => (
                      <button key={n.key} type="button" className={`ln-chip-link ${state.paths.includes(n.key) ? 'active' : ''}`} onClick={() => update({ paths: togglePath(state.paths, n.key) })}>
                        {lang === 'he' ? n.heTitle : n.title} <span className="ln-count">{fmt(n.count)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <ul className="ln-facets">
                    {facets.roots.map(n => <FacetNode key={n.key} node={n} paths={state.paths} onToggle={key => update({ paths: togglePath(state.paths, key) })} lang={lang} depth={0} />)}
                  </ul>
                )}
                {state.paths.length > 0 && <button type="button" className="ln-btn ln-btn-quiet" onClick={() => update({ paths: [] })}>{t('search.filtersClear')}</button>}
              </div>
            )}
            {!newcomer && (
              <div>
                <h2>{t('search.filterLanguage')}</h2>
                <div className="ln-chip-row" role="radiogroup" aria-label={t('search.filterLanguage')}>
                  {['all', 'he', 'en'].map(code => (
                    <button key={code} type="button" role="radio" aria-checked={state.lang === code} className={`ln-chip-link ${state.lang === code ? 'active' : ''}`} onClick={() => update({ lang: code })}>
                      {t(`search.lang${code === 'all' ? 'All' : code === 'he' ? 'He' : 'En'}`)}
                    </button>
                  ))}
                </div>
                <p className="ln-note">{t('search.loadedOnly')}</p>
              </div>
            )}
            {persona === 'educator' && (
              <div>
                <h2>{t('search.gradeTag')} <span className="ln-badge-simulated">{t('search.simulated')}</span></h2>
                <div className="ln-chip-row" role="radiogroup" aria-label={t('search.gradeTag')}>
                  {['all', ...GRADES].map(g => (
                    <button key={g} type="button" role="radio" aria-checked={grade === g} className={`ln-chip-link ${grade === g ? 'active' : ''}`} onClick={() => setGrade(g)}>
                      {t(`search.grade${g.replace(/^./, c => c.toUpperCase())}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {scholar && (
              <div>
                <h2>{t('search.advanced')}</h2>
                <div className="ln-stack">
                  <label className="ln-row">
                    <span className="ln-small">{t('search.filterEra')}</span>
                    <select className="ln-inline-select" value={state.era} onChange={e => update({ era: e.target.value })}>
                      <option value="">{t('search.eraAll')}</option>
                      {ERAS.map(e => <option key={e.id} value={e.id}>{t(e.key)}</option>)}
                    </select>
                  </label>
                  <label className="ln-row">
                    <span className="ln-small">{t('search.filterVersion')}</span>
                    <select className="ln-inline-select" value={state.version} onChange={e => update({ version: e.target.value })}>
                      <option value="">{t('search.versionAll')}</option>
                      {versions.map(v => <option key={v.version} value={v.version}>{v.version} ({v.count})</option>)}
                    </select>
                  </label>
                  <p className="ln-note">{t('search.loadedOnly')}</p>
                </div>
              </div>
            )}
          </aside>

          <div>
            {newcomer && <TopicExplainer q={state.q} lang={lang} t={t} />}
            <div className="ln-search-toolbar">
              <span className="ln-search-total" aria-live="polite">
                {status === 'loading' ? t('search.loading') : countLine()}
                {status === 'done' && total.value > 0 && clientFiltered ? ` · ${t('search.showing', { shown: filtered.length, total: fmt(results.length) })}` : ''}
              </span>
              <div className="ln-disc-actions">
                {!newcomer && (
                  <label className="ln-row">
                    <span className="ln-small">{t('search.sort')}</span>
                    <select className="ln-inline-select" value={state.sort} onChange={e => update({ sort: e.target.value })}>
                      <option value="relevance">{t('search.sortRelevance')}</option>
                      <option value="chronological">{t('search.sortChronological')}</option>
                    </select>
                  </label>
                )}
                {(persona === 'learner' || persona === 'educator') && (
                  <button type="button" className="ln-btn" aria-pressed={isSaved} onClick={toggleSave}>{isSaved ? t('search.savedAlready') : t('search.save')}</button>
                )}
                {scholar && <button type="button" className="ln-btn" disabled={!filtered.length} onClick={exportCsv}>{t('search.export')}</button>}
              </div>
            </div>
            {newcomer && status === 'done' && filtered.length > 0 && <p className="ln-search-hint">{t('search.newcomerHint')}</p>}

            {status === 'loading' && (
              <div className="ln-disc-skeleton" aria-busy="true">
                {[0, 1, 2, 3].map(i => <React.Fragment key={i}><span className="ln-skeleton-line short" /><span className="ln-skeleton-line" /><span className="ln-skeleton-line" /></React.Fragment>)}
              </div>
            )}
            {status === 'error' && (
              <div className="ln-disc-empty">
                <p>{t('search.error')}</p>
                <div className="ln-disc-actions" style={{ marginBlockStart: 'var(--ln-space-3)' }}>
                  <button type="button" className="ln-btn" onClick={retry}>{t('search.retry')}</button>
                  <a className="ln-btn ln-btn-quiet" href={classicHref}>{t('search.classic')}</a>
                </div>
              </div>
            )}
            {status === 'done' && filtered.length === 0 && (
              <div className="ln-disc-empty">
                <p>{t('search.noResults', { q: state.q })}</p>
                <p className="ln-small">{t('search.noResultsHint')}</p>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="ln-search-list">
                {filtered.map(r => (
                  <ResultCard key={r.id} r={r} q={state.q} t={t} lang={lang} contentLang={contentLang} persona={persona}
                              onLesson={onLesson} inLesson={(lessonInbox || []).some(x => x.ref === r.ref)} />
                ))}
              </div>
            )}
            {status !== 'loading' && status !== 'error' && hasMore && hits.length > 0 && (
              <div className="ln-search-more">
                <button type="button" className="ln-btn" disabled={status === 'more'} onClick={loadMore}>{status === 'more' ? t('search.loading') : t('search.loadMore')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
