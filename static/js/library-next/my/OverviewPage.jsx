/** `/my`: continue reading, streak, counts and persona quick actions. */
import React, { useMemo } from 'react';
import { useT } from '../i18n';
import { Link } from '../router';
import { usePersona, PersonaIcon, PERSONAS } from '../persona';
import { useCollection } from '../store';
import { collectionOptions, getStreak, counts, bookOf } from './collections';
import { sectionsFor, FEATURED } from './nav';
import Heatmap from './Heatmap';
import { RefLink, Empty, timeAgo, pick, useStoreTick } from './bits';
import { INBOX, useInbox, removeFromInbox } from './inbox';

const QUICK = {
  plans: { to: '/my/plans?new=1', key: 'my.quick.newPlan' },
  flashcards: { to: '/my/flashcards?review=1', key: 'my.quick.review' },
  notes: { to: '/my/notes', key: 'my.quick.notes' },
  lessons: { to: '/my/lessons/new', key: 'my.quick.newLesson' },
  shelf: { to: '/my/shelf', key: 'my.quick.shelf' },
  notebook: { to: '/my/notebook?new=1', key: 'my.quick.newEntry' },
  data: { to: '/my/data', key: 'my.quick.export' },
  history: { to: '/my/history', key: 'my.quick.history' },
};

/** The newcomer's "start here" path; progress is measured against history. */
export const START_HERE = [
  { ref: 'Genesis 1', title: 'Genesis 1', heTitle: 'בראשית א׳', key: 'my.start.genesis' },
  { ref: 'Deuteronomy 6:4-9', title: 'Deuteronomy 6:4-9', heTitle: 'דברים ו׳:ד׳-ט׳', key: 'my.start.shema' },
  { ref: 'Psalms 23', title: 'Psalms 23', heTitle: 'תהילים כ״ג', key: 'my.start.psalm' },
  { ref: 'Pirkei Avot 1', title: 'Pirkei Avot 1', heTitle: 'פרקי אבות א׳', key: 'my.start.avot' },
  { ref: 'Berakhot 2a', title: 'Berakhot 2a', heTitle: 'ברכות ב׳ א', key: 'my.start.berakhot' },
];

export function startHereProgress(history) {
  const seen = new Set(history.map(h => h.ref));
  const books = new Set(history.map(h => bookOf(h.ref)));
  return START_HERE.map(step => ({ ...step, done: seen.has(step.ref) || [...seen].some(r => r.startsWith(step.ref)) || (step.ref.indexOf(':') < 0 && books.has(step.ref)) }));
}

export default function OverviewPage() {
  const { t, lang } = useT();
  const { persona } = usePersona();
  const { items: history } = useCollection('history', collectionOptions('history'));
  const tick = useStoreTick();
  const streak = useMemo(() => getStreak(), [tick]);
  const n = useMemo(() => counts(), [tick]);
  const recent = [];
  for (const h of history) { if (!recent.some(r => r.ref === h.ref)) { recent.push(h); } if (recent.length === 3) { break; } }
  const tiles = sectionsFor(persona).filter(s => s.id !== 'overview' && s.id !== 'data');
  const quick = (FEATURED[persona] || []).map(id => ({ id, ...QUICK[id] }));
  const start = persona === 'newcomer' ? startHereProgress(history) : null;
  const searches = useInbox(INBOX.searches);

  return (
    <div className="ln-my-overview">
      <section className="ln-my-section ln-my-continue" aria-labelledby="my-continue">
        <h2 id="my-continue" className="ln-section-title">{t('my.overview.continue')}</h2>
        {recent.length ? (
          <ul className="ln-my-list">
            {recent.map(h => (
              <li key={h.id} className="ln-card ln-my-row">
                <RefLink item={h} className="ln-my-row-title" />
                <span className="ln-small ln-muted ln-my-row-meta">
                  <PersonaIcon persona={h.persona} size={14} /> {pick(PERSONAS[h.persona] ? PERSONAS[h.persona].label : PERSONAS.newcomer.label)} · {timeAgo(h.ts, lang)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty action={<Link className="ln-btn" to="/texts">{t('my.overview.browse')}</Link>}>{t('my.overview.noHistory')}</Empty>
        )}
      </section>

      <section className="ln-my-section" aria-labelledby="my-streak">
        <h2 id="my-streak" className="ln-section-title">{t('my.overview.streak')}</h2>
        <div className="ln-card ln-my-streak">
          <dl className="ln-my-stats">
            <div><dt>{t('my.streak.current')}</dt><dd>{t('my.streak.days', { n: streak.current })}</dd></div>
            <div><dt>{t('my.streak.longest')}</dt><dd>{t('my.streak.days', { n: streak.longest })}</dd></div>
            <div><dt>{t('my.streak.total')}</dt><dd>{t('my.streak.days', { n: streak.total })}</dd></div>
          </dl>
          <Heatmap days={streak.days} />
        </div>
      </section>

      {start && (
        <section className="ln-my-section" aria-labelledby="my-start">
          <h2 id="my-start" className="ln-section-title">{t('my.start.title')}</h2>
          <p className="ln-muted">{t('my.start.progress', { done: start.filter(s => s.done).length, total: start.length })}</p>
          <ol className="ln-my-start">
            {start.map(step => (
              <li key={step.ref} className={step.done ? 'is-done' : ''}>
                <span className="ln-my-start-mark" aria-hidden="true">{step.done ? '✓' : ''}</span>
                <RefLink item={step}>{t(step.key)}</RefLink>
              </li>
            ))}
          </ol>
        </section>
      )}

      {searches.length > 0 && (
        <section className="ln-my-section" aria-labelledby="my-searches">
          <h2 id="my-searches" className="ln-section-title">{t('my.searches.title')}</h2>
          <ul className="ln-my-list">
            {searches.map(s => (
              <li key={s.url} className="ln-card ln-my-row">
                <Link to={s.url} className="ln-my-ref ln-my-row-title">{s.q}{s.exact ? ` · ${t('my.searches.exact')}` : ''}</Link>
                <span className="ln-row">
                  <span className="ln-small ln-muted ln-my-row-meta">{timeAgo(s.ts, lang)}</span>
                  <button type="button" className="ln-icon-button" aria-label={t('my.searches.forget')} onClick={() => removeFromInbox(INBOX.searches, s)}>×</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ln-my-section" aria-labelledby="my-quick">
        <h2 id="my-quick" className="ln-section-title">{t('my.overview.quick')}</h2>
        <div className="ln-row">
          {quick.map((q, i) => <Link key={q.id} className={`ln-btn ${i === 0 ? 'ln-btn-primary' : ''}`} to={q.to}>{t(q.key)}</Link>)}
        </div>
      </section>

      <section className="ln-my-section" aria-labelledby="my-counts">
        <h2 id="my-counts" className="ln-section-title">{t('my.overview.counts')}</h2>
        <ul className="ln-my-tiles">
          {tiles.map(s => (
            <li key={s.id}>
              <Link to={`/my/${s.path}`} className="ln-card ln-my-tile">
                <span className="ln-my-tile-n">{s.id === 'notes' ? n.notes + n.highlights : n[s.id]}</span>
                <span className="ln-my-tile-label">{t(s.key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
