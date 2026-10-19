/** `/my/history`: reading history, pausable and clearable; everything stays on this device. */
import React from 'react';
import { useT } from '../i18n';
import { useCollection, useKv } from '../store';
import { toast } from '../overlays';
import { PersonaIcon, PERSONAS } from '../persona';
import { collectionOptions, clearHistory, HISTORY_PAUSED_KEY } from './collections';
import { dayKey } from './dates';
import { RefLink, Empty, ConfirmButton, Switch, formatDate, pick } from './bits';

export default function HistoryPage() {
  const { t, lang } = useT();
  const { items } = useCollection('history', collectionOptions('history'));
  const [paused, setPaused] = useKv(HISTORY_PAUSED_KEY, false);
  const groups = [];
  items.forEach(h => {
    const key = dayKey(new Date(h.ts));
    const last = groups[groups.length - 1];
    if (last && last.key === key) { last.rows.push(h); } else { groups.push({ key, rows: [h] }); }
  });
  return (
    <div className="ln-my-history">
      <div className="ln-card ln-my-controls">
        <Switch checked={paused === true} onChange={setPaused} label={t('my.history.pause')} hint={t('my.history.pauseHint')} />
        <ConfirmButton onConfirm={() => { clearHistory(); toast(t('my.history.cleared')); }} confirmLabel={t('my.history.clearConfirm')} disabled={!items.length}>
          {t('my.history.clear')}
        </ConfirmButton>
      </div>
      <p className="ln-small ln-muted">{t('my.history.local')}</p>
      {items.length === 0 ? (
        <Empty>{paused ? t('my.history.pausedEmpty') : t('my.history.empty')}</Empty>
      ) : groups.map(g => (
        <section key={g.key} className="ln-my-section" aria-label={formatDate(new Date(g.key.replace(/-/g, '/')), lang)}>
          <h2 className="ln-my-day">{formatDate(new Date(g.key.replace(/-/g, '/')), lang, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
          <ul className="ln-my-list ln-my-timeline">
            {g.rows.map(h => (
              <li key={h.id} className="ln-my-row">
                <time className="ln-small ln-muted" dateTime={new Date(h.ts).toISOString()}>{new Date(h.ts).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' })}</time>
                <RefLink item={h} className="ln-my-row-title" />
                <span className="ln-small ln-muted ln-my-row-meta" title={pick((PERSONAS[h.persona] || PERSONAS.newcomer).label)}>
                  <PersonaIcon persona={h.persona} size={14} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
