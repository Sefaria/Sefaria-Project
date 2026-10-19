/**
 * SM-2 lite spaced repetition for flashcards. A card carries `interval` (days), `ease`, `reps`
 * and `due` (ms). Four grades, as in most SM-2 apps: again, hard, good, easy.
 */
export const GRADES = ['again', 'hard', 'good', 'easy'];
export const AGAIN_DELAY_MS = 10 * 60 * 1000;
const DAY_MS = 86400000;
const MIN_EASE = 1.3;

/** The interval (days; 0 means "in ten minutes") each grade would give `card`. */
export function intervalsFor(card) {
  const interval = card.interval || 0;
  const ease = card.ease || 2.5;
  const reps = card.reps || 0;
  return {
    again: 0,
    hard: reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2)),
    good: reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease)),
    easy: reps === 0 ? 2 : Math.max(interval + 2, Math.round(interval * ease * 1.3)),
  };
}

/** The card after grading it now. Pure: returns a new object. */
export function review(card, grade, now = Date.now()) {
  if (!GRADES.includes(grade)) { throw new TypeError(`grade must be one of ${GRADES.join(', ')}`); }
  const ease = card.ease || 2.5;
  const days = intervalsFor(card)[grade];
  const next = {
    again: { reps: 0, ease: Math.max(MIN_EASE, ease - 0.2) },
    hard: { reps: (card.reps || 0) + 1, ease: Math.max(MIN_EASE, ease - 0.15) },
    good: { reps: (card.reps || 0) + 1, ease },
    easy: { reps: (card.reps || 0) + 1, ease: ease + 0.15 },
  }[grade];
  return {
    ...card,
    interval: days,
    ease: Math.round(next.ease * 100) / 100,
    reps: next.reps,
    due: now + (days === 0 ? AGAIN_DELAY_MS : days * DAY_MS),
    lastReview: now,
  };
}

/** Cards due by `now`, soonest first. */
export function dueCards(cards, now = Date.now()) {
  return cards.filter(c => (c.due || 0) <= now).sort((a, b) => (a.due || 0) - (b.due || 0));
}

/** Short label for an interval: 0 → '10m', 1 → '1d', 40 → '1.3mo'. */
export function intervalLabel(days) {
  if (days === 0) { return '10m'; }
  if (days < 30) { return `${days}d`; }
  if (days < 365) { return `${Math.round((days / 30) * 10) / 10}mo`; }
  return `${Math.round((days / 365) * 10) / 10}y`;
}
