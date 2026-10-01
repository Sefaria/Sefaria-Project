/** `/my/flashcards`: cards with a spaced-repetition review session (SM-2 lite). */
import React, { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { useCollection } from '../store';
import { toast } from '../overlays';
import { collectionOptions, addFlashcard, updateFlashcard } from './collections';
import { review, intervalsFor, dueCards, intervalLabel, GRADES } from './sm2';
import { RefLink, Empty, ConfirmButton, hasHebrew, timeAgo } from './bits';

function Review({ cards, get, onClose, t }) {
  const [queue, setQueue] = useState(() => cards.map(c => c.id));
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [graded, setGraded] = useState(0);
  const card = i < queue.length ? get(queue[i]) : null;
  if (!card) {
    return (
      <div className="ln-card ln-my-review ln-my-review-done" role="status">
        <p className="ln-my-review-big">{t('my.cards.sessionDone', { n: graded })}</p>
        <button type="button" className="ln-btn ln-btn-primary" onClick={onClose}>{t('my.done')}</button>
      </div>
    );
  }
  const intervals = intervalsFor(card);
  const grade = (g) => {
    updateFlashcard(card.id, review(card, g));
    setGraded(n => n + 1);
    if (g === 'again') { setQueue(q => [...q, card.id]); }
    setI(n => n + 1);
    setRevealed(false);
  };
  return (
    <div className="ln-card ln-my-review" aria-live="polite">
      <p className="ln-small ln-muted">{t('my.cards.progress', { i: Math.min(i + 1, queue.length), total: queue.length })}</p>
      <p className={`ln-my-review-big ${hasHebrew(card.front) ? 'ln-text-he' : 'ln-text-en'}`} lang={hasHebrew(card.front) ? 'he' : 'en'}>{card.front}</p>
      {revealed ? (
        <>
          <hr className="ln-rule" />
          <p className={`ln-my-review-back ${hasHebrew(card.back) ? 'ln-text-he' : 'ln-text-en'}`} lang={hasHebrew(card.back) ? 'he' : 'en'}>{card.back}</p>
          {card.ref && <p className="ln-small"><RefLink item={{ ref: card.ref }} /></p>}
          <div className="ln-my-grades">
            {GRADES.map(g => (
              <button key={g} type="button" className={`ln-btn ln-my-grade is-${g}`} onClick={() => grade(g)}>
                <span>{t(`my.cards.grade.${g}`)}</span><span className="ln-small ln-muted">{intervalLabel(intervals[g])}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button type="button" className="ln-btn ln-btn-primary" onClick={() => setRevealed(true)}>{t('my.cards.show')}</button>
      )}
      <button type="button" className="ln-btn ln-btn-quiet ln-my-review-exit" onClick={onClose}>{t('my.cards.endSession')}</button>
    </div>
  );
}

export default function FlashcardsPage({ query = {} }) {
  const { t, lang } = useT();
  const { items: cards, get, remove } = useCollection('flashcards', collectionOptions('flashcards'));
  const [session, setSession] = useState(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [ref, setRef] = useState('');
  const now = Date.now();
  const due = dueCards(cards, now);
  useEffect(() => { if (query.review === '1' && due.length && !session) { setSession(due); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const add = (e) => {
    e.preventDefault();
    try { addFlashcard(front, back, { ref: ref.trim() }); setFront(''); setBack(''); setRef(''); toast(t('my.cards.added')); } catch (err) { toast(t('my.cards.needBoth')); }
  };

  return (
    <div className="ln-my-cards">
      {session ? (
        <Review cards={session} get={get} onClose={() => setSession(null)} t={t} />
      ) : (
        <div className="ln-card ln-my-controls">
          <dl className="ln-my-stats">
            <div><dt>{t('my.cards.due')}</dt><dd>{due.length}</dd></div>
            <div><dt>{t('my.cards.total')}</dt><dd>{cards.length}</dd></div>
          </dl>
          <button type="button" className="ln-btn ln-btn-primary" disabled={!due.length} onClick={() => setSession(due)}>{t('my.cards.start')}</button>
        </div>
      )}

      {cards.length === 0 ? (
        <Empty>{t('my.cards.empty')}</Empty>
      ) : !session && (
        <ul className="ln-my-list">
          {[...cards].sort((a, b) => (a.due || 0) - (b.due || 0)).map(c => (
            <li key={c.id} className="ln-card ln-my-row ln-my-card-row">
              <div className="ln-my-row-main">
                <span className={`ln-my-card-front ${hasHebrew(c.front) ? 'ln-text-he-ui' : ''}`}>{c.front}</span>
                <span className={`ln-muted ${hasHebrew(c.back) ? 'ln-text-he-ui' : ''}`}>{c.back}</span>
                {c.ref && <RefLink item={{ ref: c.ref }} className="ln-small" />}
              </div>
              <span className="ln-small ln-muted">{(c.due || 0) <= now ? t('my.cards.dueNow') : t('my.cards.dueIn', { when: timeAgo(now - ((c.due || 0) - now), lang).replace(/ ago$|^לפני /, '') })}</span>
              <ConfirmButton onConfirm={() => remove(c.id)} className="ln-icon-button" confirmLabel="?">×</ConfirmButton>
            </li>
          ))}
        </ul>
      )}

      <details className="ln-my-details" open={cards.length === 0}>
        <summary>{t('my.cards.add')}</summary>
        <form className="ln-my-form" onSubmit={add}>
          <label>{t('my.cards.front')}<input className="ln-input" value={front} onChange={e => setFront(e.target.value)} required /></label>
          <label>{t('my.cards.back')}<input className="ln-input" value={back} onChange={e => setBack(e.target.value)} required /></label>
          <label>{t('my.form.refOptional')}<input className="ln-input" value={ref} onChange={e => setRef(e.target.value)} placeholder="Genesis 1:1" /></label>
          <button type="submit" className="ln-btn ln-btn-primary">{t('my.cards.save')}</button>
        </form>
      </details>
      <p className="ln-small ln-muted">{t('my.cards.readerHint')}</p>
    </div>
  );
}
