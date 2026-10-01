import { history, streak, shelf, recordReading, todayISO, isOnShelf, saveToShelf, removeFromShelf } from '../collections';
import { isOnShelf as myIsOnShelf, setShelfTags, isHistoryPaused, setHistoryPaused } from '../../my/collections';
import { _resetStore, PREFIX, flush } from '../../store';

beforeEach(() => { _resetStore(); localStorage.clear(); });

test('recordReading writes one history row per section read and one streak day', () => {
  recordReading({ ref: 'Genesis 1', heRef: 'בראשית א׳', title: 'Genesis', heTitle: 'בראשית', persona: 'learner' });
  recordReading({ ref: 'Genesis 1', title: 'Genesis', persona: 'learner' });
  recordReading({ ref: 'Berakhot 2a', title: 'Berakhot', persona: 'learner' });
  expect(history().list().map(h => h.ref).sort()).toEqual(['Berakhot 2a', 'Genesis 1']);
  expect(history().list().find(h => h.ref === 'Genesis 1')).toMatchObject({ ref: 'Genesis 1', title: 'Genesis 1', heTitle: 'בראשית א׳', book: 'Genesis', persona: 'learner' });
  expect(streak().list()).toHaveLength(1);
  expect(streak().list()[0]).toMatchObject({ id: todayISO(), date: todayISO() });
  expect(recordReading({ ref: '' })).toBeNull();
  flush();
  expect(JSON.parse(localStorage.getItem(PREFIX + 'history')).v).toBe(1);
});

test('recordReading honours the My Library history pause', () => {
  setHistoryPaused(true);
  expect(isHistoryPaused()).toBe(true);
  expect(recordReading({ ref: 'Genesis 1', title: 'Genesis' })).toBeNull();
  expect(history().list()).toHaveLength(0);
});

test('shelf save / check / remove use the My Library ids, so /my/shelf can edit and remove them', () => {
  expect(isOnShelf('Genesis 1:2')).toBe(false);
  saveToShelf({ ref: 'Genesis 1:2', heRef: 'בראשית א׳:ב׳', title: 'Genesis', tags: ['creation'], persona: 'newcomer' });
  expect(isOnShelf('Genesis 1:2')).toBe(true);
  expect(myIsOnShelf('Genesis 1:2')).toBe(true);
  expect(shelf().list()[0]).toMatchObject({ id: 'shelf:Genesis 1:2', ref: 'Genesis 1:2', title: 'Genesis 1:2', heTitle: 'בראשית א׳:ב׳', tags: ['creation'], kind: 'ref' });
  expect(setShelfTags('Genesis 1:2', ['x'])).not.toBeNull();
  saveToShelf({ ref: 'Genesis', title: 'Genesis', heTitle: 'בראשית', type: 'book' });
  expect(shelf().get('shelf:Genesis')).toMatchObject({ title: 'Genesis', heTitle: 'בראשית', kind: 'book' });
  expect(removeFromShelf('Genesis 1:2')).toBe(true);
  expect(isOnShelf('Genesis 1:2')).toBe(false);
});

test('todayISO is a local calendar date', () => {
  expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
});
