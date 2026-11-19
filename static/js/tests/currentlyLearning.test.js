/* Testing done using Jest */
// Currently Learning POC: device (logged-out) history helpers.
import {
  addHistoryItem,
  booksFromHistory,
  orderWithPins,
  groupVisitsByDay,
  relativeDay,
  readAnonHistory,
  writeAnonHistory,
  clearAnonHistory,
  COALESCE_SECONDS,
  shouldWelcomeBack,
  WELCOME_BACK_MIN_AGE_SECONDS,
  WELCOME_BACK_MAX_DISMISSALS,
} from '../sefaria/currentlyLearning';

const item = (ref, book, time_stamp) => ({ ref, book, time_stamp, versions: {} });

describe('addHistoryItem', () => {
  it('replaces the newest item when it is the same book within the window', () => {
    const items = addHistoryItem(
      [item('Pirkei Avot 2:1', 'Pirkei Avot', 100)],
      item('Pirkei Avot 2:2', 'Pirkei Avot', 130)
    );
    expect(items.map((x) => x.ref)).toEqual(['Pirkei Avot 2:2']);
  });
  it('adds a new item for another book or after the window', () => {
    let items = [item('Pirkei Avot 2:1', 'Pirkei Avot', 100)];
    items = addHistoryItem(items, item('Genesis 1:1', 'Genesis', 110));
    items = addHistoryItem(items, item('Genesis 1:5', 'Genesis', 110 + COALESCE_SECONDS + 1));
    expect(items.map((x) => x.ref)).toEqual(['Genesis 1:5', 'Genesis 1:1', 'Pirkei Avot 2:1']);
  });
});

describe('booksFromHistory / orderWithPins', () => {
  const history = [
    item('Genesis 1:5', 'Genesis', 300),
    item('Sheet 12', 'Sheet', 250),
    item('Pirkei Avot 2:4', 'Pirkei Avot', 200),
    item('Genesis 1:1', 'Genesis', 100),
  ];
  it('keeps the latest place per book and skips sheets', () => {
    expect(booksFromHistory(history).map((x) => x.ref)).toEqual(['Genesis 1:5', 'Pirkei Avot 2:4']);
  });
  it('puts pinned books first', () => {
    const ordered = orderWithPins(booksFromHistory(history), ['Pirkei Avot']);
    expect(ordered.map((x) => [x.book, x.pinned])).toEqual([
      ['Pirkei Avot', true],
      ['Genesis', false],
    ]);
  });
});

describe('days', () => {
  const now = new Date(2026, 10, 9, 12, 0);
  const ts = (d) => d.getTime() / 1000;
  it('labels today and yesterday', () => {
    expect(relativeDay(ts(new Date(2026, 10, 9, 8, 0)), now)).toBe('today');
    expect(relativeDay(ts(new Date(2026, 10, 8, 23, 0)), now)).toBe('yesterday');
    expect(relativeDay(ts(new Date(2026, 10, 3, 9, 0)), now)).toBe(null);
  });
  it('groups visits by calendar day', () => {
    const visits = [
      item('A 1', 'A', ts(new Date(2026, 10, 9, 11, 30))),
      item('A 2', 'A', ts(new Date(2026, 10, 9, 11, 23))),
      item('A 3', 'A', ts(new Date(2026, 10, 3, 21, 2))),
    ];
    expect(groupVisitsByDay(visits).map((g) => g.visits.length)).toEqual([2, 1]);
  });
});

describe('storage', () => {
  it('round-trips and clears', () => {
    writeAnonHistory([item('Genesis 1:1', 'Genesis', 1)]);
    expect(readAnonHistory()).toHaveLength(1);
    clearAnonHistory();
    expect(readAnonHistory()).toEqual([]);
  });
});

describe('shouldWelcomeBack', () => {
  const now = 1_000_000;
  const saved = { ref: 'Pirkei Avot 2:4', book: 'Pirkei Avot', time_stamp: now - WELCOME_BACK_MIN_AGE_SECONDS - 1 };
  const base = { saved, savedSection: 'Pirkei Avot 2', landedSection: 'Pirkei Avot 5', nowSeconds: now };
  it('offers the saved place when landing elsewhere in the book on a later visit', () => {
    expect(shouldWelcomeBack(base)).toBe(true);
  });
  it('stays quiet when landing in the saved section', () => {
    expect(shouldWelcomeBack({ ...base, landedSection: 'Pirkei Avot 2' })).toBe(false);
  });
  it('stays quiet within the same visit', () => {
    expect(shouldWelcomeBack({ ...base, saved: { ...saved, time_stamp: now - 60 } })).toBe(false);
  });
  it('stops after repeated "Stay here"', () => {
    expect(shouldWelcomeBack({ ...base, dismissals: { 'Pirkei Avot': WELCOME_BACK_MAX_DISMISSALS } })).toBe(false);
  });
});

describe('shouldShowFirstVisit', () => {
  const { shouldShowFirstVisit } = require('../sefaria/currentlyLearning');
  it('waits for real reading', () => {
    expect(shouldShowFirstVisit({ shown: false, blocked: false, distinctRefs: 2, secondsReading: 20 })).toBe(false);
  });
  it('shows after 5 verses or 60 seconds', () => {
    expect(shouldShowFirstVisit({ shown: false, blocked: false, distinctRefs: 5, secondsReading: 10 })).toBe(true);
    expect(shouldShowFirstVisit({ shown: false, blocked: false, distinctRefs: 1, secondsReading: 60 })).toBe(true);
  });
  it('never repeats or competes with another prompt', () => {
    expect(shouldShowFirstVisit({ shown: true, blocked: false, distinctRefs: 9, secondsReading: 90 })).toBe(false);
    expect(shouldShowFirstVisit({ shown: false, blocked: true, distinctRefs: 9, secondsReading: 90 })).toBe(false);
  });
});
