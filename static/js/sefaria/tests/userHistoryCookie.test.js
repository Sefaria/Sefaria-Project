/* Testing done using Jest */
import Sefaria from '../sefaria';

const BUDGET = Sefaria.MAX_ANON_HISTORY_BYTES;

const encodedLength = (items) => encodeURIComponent(JSON.stringify(items)).length;

// Mirrors what `saveUserHistory` stores for a logged out user: the fields set by
// `ReaderApp.getHistoryObject`, plus `time_stamp` and the `he_ref` looked up
// through `Sefaria.getRef`.
const historyItem = (i, { heavy = false } = {}) => ({
  ref: heavy ? `Mishneh Torah, Foundations of the Torah ${i}:1` : `Genesis ${i}:1`,
  book: heavy ? 'Mishneh Torah, Foundations of the Torah' : 'Genesis',
  he_ref: heavy ? `משנה תורה, הלכות יסודי התורה ${i}׳:א׳` : `בראשית ${i}׳:א׳`,
  versions: heavy
    ? {
        en: 'Mishneh Torah, trans. by Eliyahu Touger. Jerusalem, Moznaim Pub. c1986-c2007',
        he: 'Wikisource Mishneh Torah',
      }
    : {},
  language: 'bilingual',
  time_stamp: 1754300000 + i,
});

const makeItems = (n, opts) => Array.from({ length: n }, (_, i) => historyItem(i, opts));

describe('_trimUserHistoryForCookie', () => {
  test('returns an empty array for empty input', () => {
    expect(Sefaria._trimUserHistoryForCookie([])).toEqual([]);
  });

  test('keeps everything when the whole list already fits', () => {
    const items = makeItems(3);
    expect(encodedLength(items)).toBeLessThanOrEqual(BUDGET);
    expect(Sefaria._trimUserHistoryForCookie(items)).toEqual(items);
  });

  test('stays within the byte budget for short refs', () => {
    const items = makeItems(200);
    expect(encodedLength(items)).toBeGreaterThan(BUDGET);
    const trimmed = Sefaria._trimUserHistoryForCookie(items);
    expect(encodedLength(trimmed)).toBeLessThanOrEqual(BUDGET);
    expect(trimmed.length).toBeLessThan(items.length);
  });

  test('stays within the byte budget for long Hebrew refs with version titles', () => {
    const items = makeItems(200, { heavy: true });
    const trimmed = Sefaria._trimUserHistoryForCookie(items);
    expect(encodedLength(trimmed)).toBeLessThanOrEqual(BUDGET);
  });

  test('bulky items yield fewer entries than compact ones', () => {
    const light = Sefaria._trimUserHistoryForCookie(makeItems(200));
    const heavy = Sefaria._trimUserHistoryForCookie(makeItems(200, { heavy: true }));
    expect(heavy.length).toBeLessThan(light.length);
  });

  test('keeps the newest items and drops the oldest', () => {
    const items = makeItems(200);
    const trimmed = Sefaria._trimUserHistoryForCookie(items);
    // Items arrive newest first, so the survivors are a leading run in order.
    expect(trimmed).toEqual(items.slice(0, trimmed.length));
  });

  test('adding one more item would exceed the budget', () => {
    const items = makeItems(200);
    const trimmed = Sefaria._trimUserHistoryForCookie(items);
    const oneMore = items.slice(0, trimmed.length + 1);
    expect(encodedLength(oneMore)).toBeGreaterThan(BUDGET);
  });

  test('drops a single item that is larger than the whole budget', () => {
    const oversized = { ...historyItem(1), he_ref: 'א'.repeat(BUDGET) };
    expect(Sefaria._trimUserHistoryForCookie([oversized, historyItem(2)])).toEqual([]);
  });
});

describe('logged-out recent books', () => {
  const DAY = 24 * 60 * 60;
  const now = () => Sefaria.util.epoch_time();
  const item = (book, ageDays = 0) => ({ ref: `${book} 1:1`, book, time_stamp: now() - ageDays * DAY });
  const books = (items) => items.map((x) => x.book);

  afterEach(() => {
    document.cookie = 'user_history=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    jest.restoreAllMocks();
  });

  test('a new place replaces its book', () => {
    const items = [item('Exodus'), item('Genesis')];
    const added = Sefaria._addToAnonHistory(items, [{ ...item('Genesis'), ref: 'Genesis 2:1' }]);
    expect(added.map((x) => x.ref)).toEqual(['Genesis 2:1', 'Exodus 1:1']);
  });

  test('keeps the newest books, up to the maximum', () => {
    const items = ['A', 'B', 'C', 'D', 'E'].map((b) => item(b));
    expect(books(Sefaria._addToAnonHistory(items, [item('F')]))).toEqual(['F', 'A', 'B', 'C', 'D']);
  });

  test('reading the cookie drops places older than the limit', () => {
    const items = [item('Genesis', 1), item('Exodus', Sefaria.ANON_HISTORY_DAYS + 1)];
    document.cookie = `user_history=${encodeURIComponent(JSON.stringify(items))}; path=/`;
    expect(books(Sefaria._readAnonHistory())).toEqual(['Genesis']);
  });

  test('liturgy is excluded from recent books', () => {
    jest.spyOn(Sefaria, 'index').mockImplementation((title) => ({
      primary_category: title === 'Siddur Ashkenaz' ? 'Liturgy' : 'Tanakh',
    }));
    expect(Sefaria.isExcludedFromRecentBooks('Genesis')).toBe(false);
    expect(Sefaria.isExcludedFromRecentBooks('Siddur Ashkenaz')).toBe(true);
  });
});
