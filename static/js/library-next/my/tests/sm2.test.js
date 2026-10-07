import { review, intervalsFor, dueCards, intervalLabel, GRADES, AGAIN_DELAY_MS } from '../sm2';

const DAY = 86400000;
const fresh = { id: 'c', front: 'q', back: 'a', interval: 0, ease: 2.5, reps: 0, due: 0 };

test('a new card: good → 1 day, then 3, then interval × ease', () => {
  const now = 1_000_000_000_000;
  const r1 = review(fresh, 'good', now);
  expect(r1).toMatchObject({ interval: 1, reps: 1, ease: 2.5, due: now + DAY, lastReview: now });
  const r2 = review(r1, 'good', now + DAY);
  expect(r2).toMatchObject({ interval: 3, reps: 2, due: now + DAY + 3 * DAY });
  const r3 = review(r2, 'good', now + 4 * DAY);
  expect(r3.interval).toBe(8);                 // round(3 × 2.5)
  expect(r3.ease).toBe(2.5);
  expect(fresh.interval).toBe(0);              // pure
});

test('again resets reps and lowers ease; hard and easy adjust ease', () => {
  const mature = { ...fresh, interval: 20, ease: 2.5, reps: 5 };
  const again = review(mature, 'again', 0);
  expect(again).toMatchObject({ interval: 0, reps: 0, ease: 2.3, due: AGAIN_DELAY_MS });
  const hard = review(mature, 'hard', 0);
  expect(hard).toMatchObject({ interval: 24, reps: 6, ease: 2.35 });
  const easy = review(mature, 'easy', 0);
  expect(easy).toMatchObject({ interval: 65, reps: 6, ease: 2.65 });
  expect(review({ ...mature, ease: 1.3 }, 'again', 0).ease).toBe(1.3);   // floor
  expect(() => review(fresh, 'meh')).toThrow(TypeError);
});

test('intervalsFor previews every grade', () => {
  expect(intervalsFor(fresh)).toEqual({ again: 0, hard: 1, good: 1, easy: 2 });
  expect(intervalsFor({ ...fresh, interval: 1, reps: 1 })).toEqual({ again: 0, hard: 1, good: 3, easy: 3 });
  expect(intervalsFor({ ...fresh, interval: 10, reps: 3, ease: 2.0 })).toEqual({ again: 0, hard: 12, good: 20, easy: 26 });
  expect(GRADES).toEqual(['again', 'hard', 'good', 'easy']);
});

test('dueCards filters and orders by due', () => {
  const cards = [{ id: 'a', due: 300 }, { id: 'b', due: 100 }, { id: 'c', due: 900 }, { id: 'd' }];
  expect(dueCards(cards, 300).map(c => c.id)).toEqual(['d', 'b', 'a']);
  expect(dueCards(cards, 50).map(c => c.id)).toEqual(['d']);
});

test('intervalLabel', () => {
  expect(intervalLabel(0)).toBe('10m');
  expect(intervalLabel(3)).toBe('3d');
  expect(intervalLabel(45)).toBe('1.5mo');
  expect(intervalLabel(400)).toBe('1.1y');
});
