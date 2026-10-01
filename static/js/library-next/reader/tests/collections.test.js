import { history, streak, shelf, recordReading, todayISO, isOnShelf, saveToShelf, removeFromShelf } from '../collections';
import { _resetStore, PREFIX, flush } from '../../store';

beforeEach(() => { _resetStore(); localStorage.clear(); });

test('recordReading writes one history row per ref and one streak day', () => {
  recordReading({ ref: 'Genesis 1', heRef: 'בראשית א׳', title: 'Genesis', heTitle: 'בראשית', persona: 'learner' });
  recordReading({ ref: 'Genesis 1', title: 'Genesis', persona: 'learner' });
  recordReading({ ref: 'Berakhot 2a', title: 'Berakhot', persona: 'learner' });
  expect(history().list().map(h => h.ref).sort()).toEqual(['Berakhot 2a', 'Genesis 1']);
  expect(history().get('h:Genesis 1')).toMatchObject({ ref: 'Genesis 1', title: 'Genesis', persona: 'learner' });
  expect(streak().list()).toHaveLength(1);
  expect(streak().list()[0]).toMatchObject({ id: todayISO(), date: todayISO() });
  expect(recordReading({ ref: '' })).toBeNull();
  flush();
  expect(JSON.parse(localStorage.getItem(PREFIX + 'history')).v).toBe(1);
});

test('shelf save / check / remove', () => {
  expect(isOnShelf('Genesis 1:2')).toBe(false);
  saveToShelf({ ref: 'Genesis 1:2', title: 'Genesis', tags: ['creation'], persona: 'newcomer' });
  expect(isOnShelf('Genesis 1:2')).toBe(true);
  expect(shelf().list()[0]).toMatchObject({ ref: 'Genesis 1:2', tags: ['creation'], type: 'ref' });
  expect(removeFromShelf('Genesis 1:2')).toBe(true);
  expect(isOnShelf('Genesis 1:2')).toBe(false);
});

test('todayISO is a local calendar date', () => {
  expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
});
