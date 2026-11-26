/** A calendar heatmap of reading days: one column per week, one row per weekday, ending today. */
import React from 'react';
import { useT } from '../i18n';
import { dayKey, addDays, fromDayKey } from './dates';

export function heatLevel(count) {
  if (!count) { return 0; }
  if (count === 1) { return 1; }
  if (count <= 3) { return 2; }
  if (count <= 6) { return 3; }
  return 4;
}

export default function Heatmap({ days = {}, weeks = 12, today = new Date() }) {
  const { t, lang } = useT();
  const end = dayKey(today);
  const total = weeks * 7;
  const start = addDays(end, -(total - 1));
  const offset = fromDayKey(start).getDay();            // Sunday = 0: pad so rows are weekdays
  const cells = [];
  for (let i = 0; i < offset; i++) { cells.push(null); }
  for (let i = 0; i < total; i++) { cells.push(addDays(start, i)); }
  const weekdays = t('my.streak.weekdays').split(',');
  const label = (date, count) => `${new Date(fromDayKey(date)).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' })}: ${t(count === 1 ? 'my.streak.oneRead' : 'my.streak.nReads', { n: count || 0 })}`;
  return (
    <figure className="ln-my-heatmap" aria-label={t('my.streak.heatmapLabel', { weeks })}>
      <div className="ln-my-heatmap-days" aria-hidden="true">
        {weekdays.map((d, i) => <span key={i}>{i % 2 === 1 ? d : ''}</span>)}
      </div>
      <div className="ln-my-heatmap-grid" role="img" aria-label={t('my.streak.heatmapLabel', { weeks })}>
        {cells.map((date, i) => (date
          ? <span key={date} className="ln-my-heat" data-level={heatLevel(days[date])} data-date={date} title={label(date, days[date])} />
          : <span key={`pad${i}`} className="ln-my-heat is-pad" />))}
      </div>
      <figcaption className="ln-my-heatmap-legend ln-small ln-muted">
        <span>{t('my.streak.less')}</span>
        {[0, 1, 2, 3, 4].map(l => <span key={l} className="ln-my-heat" data-level={l} aria-hidden="true" />)}
        <span>{t('my.streak.more')}</span>
      </figcaption>
    </figure>
  );
}
