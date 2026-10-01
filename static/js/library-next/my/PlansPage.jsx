/** `/my/plans`: study plans chunked by day, computed on the device; today's unit opens the reader. */
import React, { useEffect, useRef, useState } from 'react';
import { useT, pick } from '../i18n';
import { Link } from '../router';
import { useCollection } from '../store';
import { useContentLang } from '../contentLang';
import { toast } from '../overlays';
import { collectionOptions, createPlan, updatePlan, markPlanUnitDone, bookOf } from './collections';
import { planFromIndex, scheduleFor, nextUnit } from './schedule';
import { dayKey } from './dates';
import { fetchIndex, fetchCalendars, suggestBooks, refUrl } from './data';
import { RefLink, Empty, ConfirmButton, Switch, Simulated, formatDate } from './bits';

/** 1-based start section from a calendar ref like 'Bekhorot 13' or 'Genesis 5:1' (Talmud counts amudim). */
export function startSectionFor(ref, talmud) {
  const token = String(ref || '').slice(bookOf(ref).length).trim().split(/[\s:,\-–]/)[0];
  if (!token) { return undefined; }
  if (talmud) {
    const m = /^(\d+)([ab])?$/.exec(token);
    return m ? Number(m[1]) * 2 - 1 + (m[2] === 'b' ? 1 : 0) : undefined;
  }
  const n = parseInt(token, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function NewPlanForm({ onDone, t, lang }) {
  const [book, setBook] = useState('');
  const [startRef, setStartRef] = useState('');
  const [title, setTitle] = useState('');
  const [unitsPerDay, setUnitsPerDay] = useState(1);
  const [startDate, setStartDate] = useState(dayKey());
  const [suggestions, setSuggestions] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchCalendars().then(items => { if (alive) { setCalendars(items.filter(c => c.ref)); } }).catch(() => {});
    return () => { alive = false; clearTimeout(timer.current); };
  }, []);

  const onBook = (value) => {
    setBook(value); setStartRef(''); setError('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => suggestBooks(value).then(setSuggestions), 250);
  };
  const fromCalendar = (item) => {
    setBook(bookOf(item.ref)); setStartRef(item.ref); setError('');
    setTitle(`${pick(item.title)} · ${bookOf(item.ref)}`);
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const index = await fetchIndex(book.trim());
      const talmud = ((index.schema || {}).addressTypes || [])[0] === 'Talmud';
      const args = planFromIndex(index, { unitsPerDay: Number(unitsPerDay) || 1, startSection: startSectionFor(startRef, talmud), startDate });
      if (!args) { setError(t('my.plans.complex')); setBusy(false); return; }
      const unitKey = `my.plans.unit.${args.sectionName}`;
      const unitName = t(unitKey) !== unitKey ? t(unitKey) : args.sectionName.toLowerCase();
      const defaultTitle = Number(unitsPerDay) > 1 ? t('my.plans.defaultTitleN', { book: index.title, n: unitsPerDay, unit: unitName }) : t('my.plans.defaultTitle', { book: index.title, unit: unitName });
      createPlan({ ...args, title: title.trim() || defaultTitle, reminders: false });
      toast(t('my.plans.created'));
      setBusy(false);
      onDone();   // unmounts this form: no state updates after it
    } catch (err) {
      setError(t('my.plans.unknownBook'));
      setBusy(false);
    }
  };

  return (
    <form className="ln-card ln-my-form ln-my-newplan" onSubmit={submit} aria-label={t('my.plans.new')}>
      <h2 className="ln-section-title">{t('my.plans.new')}</h2>
      {calendars.length > 0 && (
        <div className="ln-my-field">
          <span className="ln-small ln-muted">{t('my.plans.fromCalendar')}</span>
          <div className="ln-row">
            {calendars.slice(0, 6).map(c => (
              <button key={c.ref} type="button" className="ln-btn ln-my-cal" onClick={() => fromCalendar(c)}>
                <span>{pick(c.title)}</span><span className="ln-small ln-muted">{pick(c.displayValue)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <label>{t('my.plans.book')}
        <input className="ln-input" value={book} onChange={e => onBook(e.target.value)} list="ln-my-book-suggest" placeholder="Genesis" required autoComplete="off" />
        <datalist id="ln-my-book-suggest">{suggestions.map(s => <option key={s.key} value={s.key}>{s.title}</option>)}</datalist>
      </label>
      {startRef && <p className="ln-small ln-muted">{t('my.plans.startingAt', { ref: startRef })}</p>}
      <div className="ln-my-form-row">
        <label>{t('my.plans.perDay')}<input className="ln-input" type="number" min="1" max="20" value={unitsPerDay} onChange={e => setUnitsPerDay(e.target.value)} /></label>
        <label>{t('my.plans.startDate')}<input className="ln-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></label>
      </div>
      <label>{t('my.plans.title')}<input className="ln-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('my.plans.titleHint')} /></label>
      {error && <p className="ln-my-error" role="alert">{error}</p>}
      <div className="ln-row">
        <button type="submit" className="ln-btn ln-btn-primary" disabled={busy || !book.trim()}>{busy ? t('my.working') : t('my.plans.create')}</button>
        <button type="button" className="ln-btn ln-btn-quiet" onClick={onDone}>{t('my.cancel')}</button>
      </div>
    </form>
  );
}

function PlanCard({ plan, remove, t, lang, contentLang }) {
  const s = scheduleFor(plan);
  const next = nextUnit(plan);
  const done = new Set(plan.done || []);
  const title = (contentLang === 'he' || (contentLang === 'bi' && lang === 'he')) && plan.heTitle ? plan.heTitle : plan.title;
  return (
    <li className={`ln-card ln-my-plan is-${s.status}`}>
      <div className="ln-my-row">
        <h2 className="ln-my-plan-title">{title}</h2>
        <span className="ln-small ln-muted">
          {s.status === 'upcoming' && t('my.plans.startsOn', { date: formatDate(new Date(plan.startDate.replace(/-/g, '/')), lang) })}
          {s.status === 'active' && t('my.plans.dayOf', { day: s.dayIndex + 1, total: s.totalDays, date: formatDate(new Date(s.endDate.replace(/-/g, '/')), lang) })}
          {s.status === 'complete' && t('my.plans.complete')}
        </span>
      </div>
      <div className="ln-my-progress" role="progressbar" aria-valuenow={s.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('my.plans.progress')}>
        <span style={{ inlineSize: `${s.pct}%` }} />
      </div>
      <p className="ln-small ln-muted">{t('my.plans.doneOf', { done: s.doneCount, total: plan.units.length, pct: s.pct })}{s.behind > 0 && ` · ${t('my.plans.behind', { n: s.behind })}`}</p>
      {s.todayUnits.length > 0 && (
        <div className="ln-my-today">
          <span className="ln-small ln-muted">{t('my.plans.today')}</span>
          <ul>
            {s.todayUnits.map(u => (
              <li key={u.ref} className="ln-my-check-row">
                <label><input type="checkbox" checked={done.has(u.ref)} onChange={e => markPlanUnitDone(plan.id, u.ref, e.target.checked)} /> <span className="ln-sr-only">{t('my.plans.markDone')}</span></label>
                <RefLink item={{ ref: u.ref, title: u.label, heTitle: u.heLabel }} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="ln-row ln-my-actions">
        {next && <Link className="ln-btn ln-btn-primary" to={refUrl(next.ref)}>{s.behind > 0 && !s.todayUnits.some(u => u.ref === next.ref) ? t('my.plans.catchUp') : t('my.plans.open')}</Link>}
        <Switch checked={plan.reminders === true} onChange={v => updatePlan(plan.id, { reminders: v })} label={<>{t('my.plans.reminders')} <Simulated /></>} />
        <ConfirmButton onConfirm={() => { remove(plan.id); toast(t('my.plans.deleted')); }}>{t('my.delete')}</ConfirmButton>
      </div>
    </li>
  );
}

export default function PlansPage({ query = {} }) {
  const { t, lang } = useT();
  const [contentLang] = useContentLang();
  const { items: plans, remove } = useCollection('plans', collectionOptions('plans'));
  const [creating, setCreating] = useState(query.new === '1');
  const showForm = creating || plans.length === 0;
  return (
    <div className="ln-my-plans">
      {!showForm && <div className="ln-row"><button type="button" className="ln-btn ln-btn-primary" onClick={() => setCreating(true)}>{t('my.plans.new')}</button></div>}
      {showForm && <NewPlanForm onDone={() => setCreating(false)} t={t} lang={lang} />}
      {plans.length === 0 ? (
        <Empty>{t('my.plans.empty')}</Empty>
      ) : (
        <ul className="ln-my-list">
          {plans.map(p => <PlanCard key={p.id} plan={p} remove={remove} t={t} lang={lang} contentLang={contentLang} />)}
        </ul>
      )}
      <p className="ln-small ln-muted">{t('my.plans.localNote')}</p>
    </div>
  );
}
