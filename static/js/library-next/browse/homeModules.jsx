/**
 * Home page modules, keyed by the ids in `PERSONAS[id].homeModules` (persona.js). Each module
 * is self-contained: it reads the store or the data layer, renders a <Section>, and renders
 * nothing (null) when it has nothing useful to say so the page never shows an empty box twice.
 */
import React, { useMemo, useState } from 'react';
import Sefaria from '../../sefaria/sefaria';
import { pick } from '../i18n';
import { Link, navigate } from '../router';
import { useCollection, useKv } from '../store';
import { BiTitle, Section, Simulated, Skeleton, Empty, Desc, ArrowLink, useLangs } from './components';
import { START_HERE, GLOSSARY, FIVE_MINUTE_READS, TOPIC_PICKS, CALENDAR_EXPLAINERS } from './curated';
import {
  refPath, bookPath, refColor, bookColor, categoryColor, nodeTitle, nodeShortDesc, topCategories, whereToStart,
  recommendFromHistory, computeStreak, groupByTag, useCalendars, sortCalendars, findCalendar, addToLesson,
} from './data';

const START_HERE_KEY = 'startHere.done';

const timeAgo = (ts, lang) => {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) { return lang === 'he' ? 'היום' : 'today'; }
  if (days === 1) { return lang === 'he' ? 'אתמול' : 'yesterday'; }
  return lang === 'he' ? `לפני ${days} ימים` : `${days} days ago`;
};

/** A ref as a card link into the reader, colored by its book's category. */
function RefCard({ item, lang, contentLang, meta, action }) {
  return (
    <li className="ln-ref-card ln-cat-rule" style={{ '--cat': refColor(item.ref) }}>
      <Link to={refPath(item.ref)} className="ln-ref-card-link">
        <BiTitle en={item.ref} he={item.heRef || item.ref} contentLang={contentLang} lang={lang} className="ln-ref-card-title" />
        {meta && <span className="ln-small ln-muted">{meta}</span>}
      </Link>
      {action}
    </li>
  );
}

export function ContinueReading() {
  const { t, lang, contentLang } = useLangs();
  const { items } = useCollection('history');
  const recent = useMemo(() => {
    const seen = new Set();
    return items.filter(h => { const k = h.title || h.ref; if (seen.has(k)) { return false; } seen.add(k); return true; }).slice(0, 4);
  }, [items]);
  return (
    <Section id="continueReading" title={t('home.continue')} action={<ArrowLink to="/my">{t('nav.my')}</ArrowLink>}>
      {recent.length ? (
        <ul className="ln-ref-cards">
          {recent.map(h => <RefCard key={h.id} item={h} lang={lang} contentLang={contentLang} meta={timeAgo(h.ts, lang)} />)}
        </ul>
      ) : <Empty>{t('home.continue.empty')}</Empty>}
    </Section>
  );
}

export function StartHere() {
  const { t, lang } = useLangs();
  const [done, setDone] = useKv(START_HERE_KEY, []);
  const doneSet = new Set(done || []);
  const toggle = (id) => setDone(doneSet.has(id) ? (done || []).filter(d => d !== id) : [...(done || []), id]);
  return (
    <Section id="startHere" title={t('home.startHere')} sub={t('home.startHere.sub')}
             action={<span className="ln-progress-pill">{t('home.startHere.progress', { done: doneSet.size, total: START_HERE.length })}</span>}>
      <ol className="ln-path">
        {START_HERE.map((step, i) => {
          const isDone = doneSet.has(step.id);
          return (
            <li key={step.id} className={`ln-path-step ${isDone ? 'is-done' : ''}`} style={{ '--cat': refColor(step.ref) }}>
              <span className="ln-path-num" aria-hidden="true">{isDone ? '✓' : i + 1}</span>
              <div className="ln-path-body">
                <h3 className="ln-path-title">{pick(step.title)}</h3>
                <p className="ln-path-blurb">{pick(step.blurb)}</p>
                <div className="ln-row">
                  <Link className="ln-btn ln-btn-primary" to={refPath(step.ref)}>{t('home.startHere.open', { ref: step.ref })}</Link>
                  <button type="button" className={`ln-btn ln-btn-quiet ln-path-done`} aria-pressed={isDone} onClick={() => toggle(step.id)}>
                    {isDone ? t('home.startHere.done') : t('home.startHere.markDone')}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function CalendarRow({ item, lang, contentLang, explain, action }) {
  const internal = item.url && !item.url.startsWith('collections/');
  const href = internal ? `/${item.url}` : `/${item.url || ''}`;
  const explainer = explain && CALENDAR_EXPLAINERS[item.title.en];
  return (
    <li className="ln-cal-row ln-cat-rule" style={{ '--cat': categoryColor(item.category) }}>
      <div className="ln-cal-row-main">
        <span className="ln-cal-name">{pick(item.title)}</span>
        <Link to={href} className="ln-cal-value">
          <BiTitle en={item.displayValue.en} he={item.displayValue.he} contentLang={contentLang} lang={lang} />
        </Link>
        {explainer && <p className="ln-small ln-muted ln-cal-explain">{pick(explainer)}</p>}
      </div>
      {action}
    </li>
  );
}

/** Today's schedules; `only` limits to a few titles, `explain` adds newcomer explainers. */
export function TodayCalendar({ only = ['Parashat Hashavua', 'Daf Yomi', 'Daily Mishnah', '929'], explain = false, id = 'calendarToday' }) {
  const { t, lang, contentLang, dir } = useLangs();
  const { items, loading, error } = useCalendars();
  const shown = useMemo(() => sortCalendars(items).filter(i => !only || only.includes(i.title.en)), [items, only]);
  return (
    <Section id={id} title={t('home.today')} sub={explain ? t('home.today.sub.newcomer') : null}
             action={<ArrowLink to="/calendars">{t('home.today.all')}</ArrowLink>}>
      {loading && <Skeleton lines={4} />}
      {error && <Empty>{t('cal.error')}</Empty>}
      {!loading && !error && (
        <ul className="ln-cal-rows" dir={dir}>
          {shown.map(item => <CalendarRow key={item.title.en} item={item} lang={lang} contentLang={contentLang} explain={explain} />)}
        </ul>
      )}
    </Section>
  );
}

/** This week's parasha, explained (newcomer) or with "add to lesson" (educator). */
export function Parasha({ forClass = false, id }) {
  const { t, lang, contentLang } = useLangs();
  const { items, loading, error } = useCalendars();
  const parasha = findCalendar(items, 'Parashat Hashavua');
  const haftarah = findCalendar(items, 'Haftarah');
  const title = forClass ? t('home.parasha.forClass') : t('home.parasha');
  return (
    <Section id={id || (forClass ? 'parashaForClass' : 'parashaExplained')} title={title} sub={forClass ? null : t('home.parasha.explain')}>
      {loading && <Skeleton lines={3} />}
      {error && <Empty>{t('cal.error')}</Empty>}
      {parasha && (
        <div className="ln-parasha ln-card ln-cat-rule" style={{ '--cat': categoryColor('Tanakh') }}>
          <h3 className="ln-parasha-name"><BiTitle en={parasha.displayValue.en} he={parasha.displayValue.he} contentLang={contentLang} lang={lang} /></h3>
          <p className="ln-muted ln-small"><BiTitle en={parasha.ref} he={parasha.heRef} contentLang={contentLang} lang={lang} /></p>
          {parasha.description && <Desc text={parasha.description} className="ln-parasha-desc" />}
          <div className="ln-row">
            <Link className="ln-btn ln-btn-primary" to={`/${parasha.url}`}>{t('home.parasha.read')}</Link>
            {haftarah && <Link className="ln-btn" to={`/${haftarah.url}`}>{t('home.parasha.haftarah')}: {pick(haftarah.displayValue)}</Link>}
            {forClass && (
              <button type="button" className="ln-btn" onClick={() => addToLesson({ ref: parasha.ref, title: parasha.displayValue.en })}>
                {t('act.addToLesson')}
              </button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

export function Plans() {
  const { t } = useLangs();
  const { items: plans } = useCollection('plans');
  const { items: streakItems } = useCollection('streak');
  const streak = computeStreak(streakItems.map(s => s.date));
  return (
    <Section id="plans" title={t('home.plans')} action={<ArrowLink to="/my/plans">{t('home.plans.all')}</ArrowLink>}>
      <div className="ln-plans">
        <div className="ln-streak ln-card" aria-label={t('home.streak')}>
          <span className="ln-streak-num">{streak}</span>
          <span className="ln-streak-label">{t('home.streak')}</span>
          <span className="ln-small ln-muted">{streak === 0 ? t('home.streak.none') : (streak === 1 ? t('home.streak.day') : t('home.streak.days', { n: streak }))}</span>
        </div>
        {plans.length ? (
          <ul className="ln-plan-list">
            {plans.slice(0, 3).map(p => (
              <li key={p.id} className="ln-plan ln-card">
                <Link to="/my/plans" className="ln-plan-title">{pick({ en: p.title, he: p.titleHe || p.title })}</Link>
                <span className="ln-small ln-muted">{t('home.plans.items', { n: (p.items || []).length })}{p.calendar ? ` · ${p.calendar}` : ''}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>{t('home.plans.empty')}</Empty>}
      </div>
    </Section>
  );
}

export function Recommendations() {
  const { t, lang, contentLang } = useLangs();
  const { items: history } = useCollection('history');
  const recs = useMemo(() => recommendFromHistory(history, 6), [history]);
  const starters = useMemo(() => topCategories().slice(0, 6).map(c => ({ category: c.category, heCategory: c.heCategory, ref: whereToStart(c.category) })).filter(c => c.ref), []);
  const based = recs.length > 0;
  return (
    <Section id="recommendations" title={t('home.recommend')} sub={based ? t('home.recommend.based') : t('home.recommend.starter')}>
      <ul className="ln-tiles">
        {based ? recs.map(book => (
          <li key={book.title} className="ln-tile ln-cat-rule" style={{ '--cat': bookColor(book) }}>
            <Link to={bookPath(book.title)} className="ln-tile-link">
              <BiTitle en={book.title} he={book.heTitle} contentLang={contentLang} lang={lang} className="ln-tile-title" />
              <Desc text={nodeShortDesc(book)} className="ln-small ln-muted" />
            </Link>
          </li>
        )) : starters.map(s => (
          <li key={s.category} className="ln-tile ln-cat-rule" style={{ '--cat': categoryColor(s.category) }}>
            <Link to={refPath(s.ref)} className="ln-tile-link">
              <span className="ln-tile-title">{pick({ en: s.category, he: s.heCategory })}</span>
              <span className="ln-small ln-muted">{s.ref}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Lessons() {
  const { t } = useLangs();
  const { items } = useCollection('lessons');
  return (
    <Section id="lessons" title={t('home.lessons')} action={<ArrowLink to="/my/lessons">{t('home.lessons.all')}</ArrowLink>}>
      {items.length ? (
        <ul className="ln-plan-list">
          {items.slice(0, 4).map(l => (
            <li key={l.id} className="ln-plan ln-card">
              <Link to={`/my/lessons/${l.id}`} className="ln-plan-title">{l.title || t('lesson.untitled')}</Link>
              <span className="ln-small ln-muted">{t('home.lessons.sources', { n: (l.sources || []).length })}</span>
            </li>
          ))}
        </ul>
      ) : <Empty>{t('home.lessons.empty')}</Empty>}
    </Section>
  );
}

export function BuildLesson() {
  const { t } = useLangs();
  return (
    <Section id="buildLesson" title={t('home.buildLesson')} sub={t('home.buildLesson.sub')}>
      <div className="ln-row">
        <Link className="ln-btn ln-btn-primary" to="/my/lessons/new">{t('home.buildLesson')}</Link>
        <Link className="ln-btn" to="/texts">{t('texts.title')}</Link>
      </div>
    </Section>
  );
}

export function SourceCollections() {
  const { t, lang, contentLang } = useLangs();
  const { items } = useCollection('shelf');
  const groups = useMemo(() => groupByTag(items).slice(0, 6), [items]);
  return (
    <Section id="sourceCollections" title={t('home.collections')} action={<ArrowLink to="/my/shelf">{t('nav.my')}</ArrowLink>}>
      {groups.length ? (
        <ul className="ln-tiles">
          {groups.map(g => (
            <li key={g.tag} className="ln-tile">
              <Link to={`/my/shelf?tag=${encodeURIComponent(g.tag)}`} className="ln-tile-link">
                <span className="ln-tile-title">{g.tag}</span>
                <span className="ln-small ln-muted">{t('home.collections.count', { n: g.items.length })}</span>
                <span className="ln-small ln-muted ln-ellipsis">{g.items.slice(0, 3).map(i => i.title || i.ref).join(' · ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <Empty>{t('home.collections.empty')}</Empty>}
    </Section>
  );
}

export function Notebook() {
  const { t, lang, contentLang } = useLangs();
  const { items } = useCollection('notebook');
  return (
    <Section id="notebook" title={t('home.notebook')} action={<ArrowLink to="/my/notebook">{t('home.notebook.all')}</ArrowLink>}>
      {items.length ? (
        <ul className="ln-ref-cards">
          {items.slice(0, 4).map(n => <RefCard key={n.id} item={n} lang={lang} contentLang={contentLang} meta={n.text ? String(n.text).slice(0, 90) : timeAgo(n.ts, lang)} />)}
        </ul>
      ) : <Empty>{t('home.notebook.empty')}</Empty>}
    </Section>
  );
}

export function Comparisons() {
  const { t, lang, contentLang } = useLangs();
  const { items } = useCollection('notebook');
  const comparisons = items.filter(n => Array.isArray(n.versions) && n.versions.length > 1).slice(0, 4);
  return (
    <Section id="comparisons" title={t('home.comparisons')}>
      {comparisons.length ? (
        <ul className="ln-ref-cards">
          {comparisons.map(n => <RefCard key={n.id} item={n} lang={lang} contentLang={contentLang} meta={`${t('home.comparisons.versions', { n: n.versions.length })} · ${n.versions.join(' / ')}`} />)}
        </ul>
      ) : <Empty>{t('home.comparisons.empty')}</Empty>}
    </Section>
  );
}

export function RecentRefs() {
  const { t, lang, contentLang } = useLangs();
  const { items } = useCollection('history');
  return (
    <Section id="recentRefs" title={t('home.recent')}>
      {items.length ? (
        <ul className="ln-ref-cards ln-ref-cards-dense">
          {items.slice(0, 8).map(h => <RefCard key={h.id} item={h} lang={lang} contentLang={contentLang} meta={timeAgo(h.ts, lang)} />)}
        </ul>
      ) : <Empty>{t('home.continue.empty')}</Empty>}
    </Section>
  );
}

const ERAS = ['T', 'A', 'GN', 'RI', 'AH', 'CO'];

export function AdvancedSearch() {
  const { t } = useLangs();
  const [q, setQ] = useState('');
  const [exact, setExact] = useState(false);
  const [era, setEra] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!q.trim()) { return; }
    const params = new URLSearchParams({ q: q.trim() });
    if (exact) { params.set('exact', '1'); }
    if (era) { params.set('era', era); }
    navigate(`/search?${params}`);
  };
  return (
    <Section id="advancedSearch" title={t('home.advanced')} sub={t('home.advanced.note')}>
      <form className="ln-adv-search" onSubmit={submit}>
        <label className="ln-field">
          <span className="ln-small ln-muted">{t('home.advanced.query')}</span>
          <input className="ln-input" type="search" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        <label className="ln-check">
          <input type="checkbox" checked={exact} onChange={e => setExact(e.target.checked)} /> {t('home.advanced.exact')}
        </label>
        <label className="ln-field">
          <span className="ln-small ln-muted">{t('home.advanced.era')}</span>
          <select className="ln-input" value={era} onChange={e => setEra(e.target.value)}>
            <option value="">{t('home.advanced.era.any')}</option>
            {ERAS.map(code => <option key={code} value={code}>{t(`era.${code}`)}</option>)}
          </select>
        </label>
        <button type="submit" className="ln-btn ln-btn-primary">{t('home.advanced.submit')}</button>
      </form>
    </Section>
  );
}

export function Glossary() {
  const { t, lang } = useLangs();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const terms = GLOSSARY.filter(g => !needle || [g.en, g.he, g.defEn, g.defHe].some(s => s.toLowerCase().includes(needle)));
  return (
    <Section id="glossary" title={t('home.glossary')}
             action={<input className="ln-input ln-glossary-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('home.glossary.search')} aria-label={t('home.glossary.search')} />}>
      {terms.length ? (
        <dl className="ln-glossary">
          {terms.map(g => (
            <div key={g.en} className="ln-term">
              <dt><span lang="en">{g.en}</span> <span lang="he" dir="rtl" className="ln-term-he">{g.he}</span></dt>
              <dd className="ln-muted">{lang === 'he' ? g.defHe : g.defEn}</dd>
            </div>
          ))}
        </dl>
      ) : <Empty>{t('home.glossary.none')}</Empty>}
    </Section>
  );
}

export function FiveMinuteReads() {
  const { t } = useLangs();
  return (
    <Section id="fiveMinuteReads" title={t('home.fiveMinute')} sub={t('home.fiveMinute.sub')}>
      <ul className="ln-tiles">
        {FIVE_MINUTE_READS.map(r => (
          <li key={r.ref} className="ln-tile ln-cat-rule" style={{ '--cat': refColor(r.ref) }}>
            <Link to={refPath(r.ref)} className="ln-tile-link">
              <span className="ln-tile-title">{pick(r.title)}</span>
              <span className="ln-small ln-muted">{r.ref} · {t('home.minutes', { n: r.minutes })}</span>
              <span className="ln-small">{pick(r.blurb)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Topics() {
  const { t } = useLangs();
  return (
    <Section id="topics" title={t('home.topics')} action={<ArrowLink to="/topics">{t('home.topics.all')}</ArrowLink>}>
      <ul className="ln-chips">
        {TOPIC_PICKS.map(tp => <li key={tp.slug}><Link className="ln-topic-chip" to={`/topics/${tp.slug}`}>{pick(tp.title)}</Link></li>)}
      </ul>
    </Section>
  );
}

export function Explore() {
  const { t, lang, contentLang } = useLangs();
  const cats = topCategories();
  return (
    <Section id="explore" title={t('home.explore')} action={<ArrowLink to="/texts">{t('home.explore.all')}</ArrowLink>}>
      <ul className="ln-cat-tiles">
        {cats.map(c => (
          <li key={c.category} className="ln-cat-tile" style={{ '--cat': categoryColor(c.category) }}>
            <Link to={`/texts/${encodeURIComponent(c.category)}`} className="ln-cat-tile-link">
              <BiTitle {...nodeTitle(c)} contentLang={contentLang} lang={lang} className="ln-cat-tile-title" />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Module id → component. Unknown ids render nothing. */
export const HOME_MODULES = {
  continueReading: ContinueReading,
  startHere: StartHere,
  parashaExplained: () => <Parasha />,
  parashaForClass: () => <Parasha forClass />,
  glossary: Glossary,
  fiveMinuteReads: FiveMinuteReads,
  calendarToday: () => <TodayCalendar explain={false} />,
  plans: Plans,
  recommendations: Recommendations,
  topics: Topics,
  lessons: Lessons,
  sourceCollections: SourceCollections,
  buildLesson: BuildLesson,
  notebook: Notebook,
  recentRefs: RecentRefs,
  comparisons: Comparisons,
  advancedSearch: AdvancedSearch,
  explore: Explore,
};

/**
 * The module order for a persona: its `homeModules`, `continueReading` first when there is
 * history and the persona did not list it, and `explore` last for everyone.
 */
export function moduleOrder(def, hasHistory) {
  const ids = (def.homeModules || []).filter(id => id in HOME_MODULES);
  if (hasHistory && !ids.includes('continueReading')) { ids.unshift('continueReading'); }
  if (!ids.includes('explore')) { ids.push('explore'); }
  return ids;
}
