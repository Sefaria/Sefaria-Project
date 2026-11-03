/**
 * A card listing the items a discover page left for this section ("waiting from search and
 * topics") with one-tap add, add-all, dismiss and clear. Pages pass `onAdd(item)`, which folds
 * the item into their collection and resolves when done; the card removes it from the inbox.
 */
import React, { useState } from 'react';
import { useT } from '../i18n';
import { Link } from '../router';
import { toast } from '../overlays';
import { RefLink, hasHebrew } from './bits';
import { useInbox, removeFromInbox, clearInbox, inboxTitle, topicPath } from './inbox';

function Origin({ item, t }) {
  if (item.from === 'search' && item.q) { return <span className="ln-small ln-muted">{t('my.inbox.fromSearch', { q: item.q })}</span>; }
  if (item.ref && item.topic) { return <span className="ln-small ln-muted">{t('my.inbox.fromTopic', { topic: typeof item.title === 'string' ? item.title : item.topic })}</span>; }
  if (!item.ref && item.topic) { return <span className="ln-small ln-muted">{t('my.inbox.topic')} · {t('my.inbox.topicSources')}</span>; }
  return null;
}

export default function InboxCard({ inboxKey, hintKey, addLabelKey, onAdd }) {
  const { t, lang } = useT();
  const items = useInbox(inboxKey);
  const [busy, setBusy] = useState(null);   // item key being added, or 'all'
  if (!items.length) { return null; }

  const add = async (item) => {
    setBusy(item.ref || item.topic);
    try {
      const n = await onAdd(item);
      if (n === 0) { toast(t('my.inbox.noSources')); } else { removeFromInbox(inboxKey, item); toast(n > 1 ? t('my.inbox.addedN', { n }) : t('my.inbox.added')); }
    } catch (err) {
      toast(t('my.inbox.failed'));
    } finally {
      setBusy(null);
    }
  };
  const addAll = async () => {
    setBusy('all');
    let added = 0;
    try {
      for (const item of items) {
        const n = await onAdd(item);   // eslint-disable-line no-await-in-loop
        if (n > 0) { removeFromInbox(inboxKey, item); added += n; }
      }
      toast(added ? t('my.inbox.addedN', { n: added }) : t('my.inbox.noSources'));
    } catch (err) {
      toast(t('my.inbox.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ln-card ln-my-inbox" aria-labelledby={`inbox-${inboxKey}`}>
      <div className="ln-my-row">
        <h2 id={`inbox-${inboxKey}`} className="ln-section-title">{t('my.inbox.title')} <span className="ln-my-inbox-count">{items.length}</span></h2>
        <div className="ln-row">
          {items.length > 1 && <button type="button" className="ln-btn" disabled={!!busy} onClick={addAll}>{busy === 'all' ? t('my.working') : t('my.inbox.addAll')}</button>}
          <button type="button" className="ln-btn ln-btn-quiet" disabled={!!busy} onClick={() => clearInbox(inboxKey)}>{t('my.inbox.clear')}</button>
        </div>
      </div>
      <p className="ln-small ln-muted">{t(hintKey)}</p>
      <ul className="ln-my-list ln-my-inbox-list">
        {items.map(item => {
          const key = item.ref || item.topic;
          const title = inboxTitle(item, lang);
          return (
            <li key={key} className="ln-my-inbox-item">
              <div className="ln-my-inbox-main">
                {item.ref
                  ? <RefLink item={{ ref: item.ref, title: item.ref, heTitle: item.heRef }} className="ln-my-row-title" />
                  : <Link to={topicPath(item.topic)} className={`ln-my-ref ln-my-row-title ${hasHebrew(title) ? 'ln-text-he-ui' : ''}`}>{title}</Link>}
                <Origin item={item} t={t} />
                {item.snippet && <p className={`ln-small ln-my-inbox-snippet ${hasHebrew(item.snippet) ? 'ln-text-he-ui' : ''}`}>{item.snippet}</p>}
              </div>
              <div className="ln-row ln-my-inbox-actions">
                <button type="button" className="ln-btn ln-btn-primary" disabled={!!busy} onClick={() => add(item)}>{busy === key ? t('my.working') : t(addLabelKey)}</button>
                <button type="button" className="ln-icon-button" aria-label={t('my.inbox.dismiss')} disabled={!!busy} onClick={() => removeFromInbox(inboxKey, item)}>×</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
