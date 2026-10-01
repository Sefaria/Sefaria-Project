/** `/calendars` — every learning schedule for today, with "follow" (a study plan) for learners. */
import React from 'react';
import { pick } from '../i18n';
import { Link } from '../router';
import { usePersona } from '../persona';
import { useCollection } from '../store';
import { BiTitle, Desc, Simulated, Skeleton, Empty, useLangs } from './components';
import { CALENDAR_EXPLAINERS } from './curated';
import { useCalendars, sortCalendars, categoryColor, followCalendar, setCalendarReminder, addToLesson } from './data';
import './styles.css';

export function CalendarCard({ item, persona, plan, lang, contentLang, t }) {
  const external = !item.url || item.url.startsWith('collections/');
  const href = `/${item.url || ''}`;
  const explainer = CALENDAR_EXPLAINERS[item.title.en];
  const canFollow = persona === 'learner' || persona === 'newcomer';
  return (
    <li className="ln-cal-card ln-card ln-cat-rule" style={{ '--cat': categoryColor(item.category) }}>
      <div className="ln-cal-card-head">
        <h2 className="ln-cal-card-title">{pick(item.title)}</h2>
        {plan && <span className="ln-small ln-following">{t('cal.following')}</span>}
      </div>
      <p className="ln-cal-card-value">
        <BiTitle en={item.displayValue.en} he={item.displayValue.he} contentLang={contentLang} lang={lang} />
      </p>
      {explainer && <p className="ln-small ln-muted">{pick(explainer)}</p>}
      {item.description && persona !== 'scholar' && <Desc text={item.description} className="ln-small ln-cal-desc" />}
      <div className="ln-row ln-cal-card-actions">
        {external
          ? <a className="ln-btn" href={href}>{t('cal.openClassic')}</a>
          : <Link className="ln-btn ln-btn-primary" to={href}>{t('cal.open')}</Link>}
        {canFollow && !plan && <button type="button" className="ln-btn" onClick={() => followCalendar(item)}>{t('cal.follow')}</button>}
        {persona === 'educator' && item.ref && <button type="button" className="ln-btn" onClick={() => addToLesson({ ref: item.ref, title: item.displayValue.en })}>{t('act.addToLesson')}</button>}
      </div>
      {plan && (
        <label className="ln-check ln-reminder">
          <input type="checkbox" checked={plan.reminders === true} onChange={e => setCalendarReminder(plan, e.target.checked)} />
          <span>{plan.reminders ? t('cal.reminder.on') : t('cal.reminder.off')}</span>
          <Simulated />
        </label>
      )}
    </li>
  );
}

export default function CalendarsPage() {
  const { t, lang, contentLang } = useLangs();
  const { persona } = usePersona();
  const { items, loading, error } = useCalendars();
  const { items: plans } = useCollection('plans');
  const sorted = sortCalendars(items);
  const date = new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', { dateStyle: 'full' }).format(new Date());
  return (
    <div className="ln-container ln-calendars" data-persona={persona}>
      <h1 className="ln-page-title">{t('cal.title')}</h1>
      <p className="ln-muted ln-page-intro">{persona === 'newcomer' ? t('cal.intro.newcomer') : t('cal.intro')}</p>
      <p className="ln-small ln-muted ln-cal-date">{t('cal.date', { date })}</p>
      {loading && <Skeleton lines={6} />}
      {error && <Empty>{t('cal.error')}</Empty>}
      {!loading && !error && (
        <ul className="ln-cal-grid">
          {sorted.map(item => (
            <CalendarCard key={item.title.en} item={item} persona={persona} lang={lang} contentLang={contentLang} t={t}
                          plan={plans.find(p => p.calendar === item.title.en) || null} />
          ))}
        </ul>
      )}
    </div>
  );
}
