import { refKind, parseRefPath, matchBook } from '../refKind';
import { seedSefaria } from './fixtures';

beforeEach(() => { seedSefaria(); });
afterEach(() => { jest.restoreAllMocks(); });

test('book-level paths: canonical titles, underscores, encoded spaces, trailing slash', () => {
  expect(refKind('/Genesis')).toBe('book');
  expect(refKind('/Rashi_on_Genesis')).toBe('book');
  expect(refKind('/Rashi%20on%20Genesis/')).toBe('book');
  expect(refKind('/Pesach_Haggadah')).toBe('book');
  expect(parseRefPath('/Rashi_on_Genesis')).toEqual({ kind: 'book', title: 'Rashi on Genesis', book: 'Rashi on Genesis', address: '' });
});

test('a title variant is still book-level and resolves to the canonical title when known', () => {
  expect(refKind('/Bereshit')).toBe('book');   // in booksDict, not an index key
  expect(parseRefPath('/Bereshit').title).toBe('Bereshit');
});

test('refs into a text belong to the reader', () => {
  expect(refKind('/Genesis.1')).toBe('ref');
  expect(refKind('/Genesis.1.1-5')).toBe('ref');
  expect(refKind('/Genesis 1:1')).toBe('ref');
  expect(refKind('/Berakhot.2a')).toBe('ref');
  expect(refKind('/Pesach_Haggadah,_Kadesh')).toBe('ref');
  expect(parseRefPath('/Berakhot.2a')).toEqual({ kind: 'ref', title: 'Berakhot', book: 'Berakhot', address: '.2a' });
});

test('Jobs is not Job; unknown titles, classic pages and files are not refs', () => {
  expect(refKind('/Jobs')).toBeNull();
  expect(refKind('/Nonexistent_Book')).toBeNull();
  expect(refKind('/texts')).toBeNull();
  expect(refKind('/texts/Tanakh')).toBeNull();
  expect(refKind('/login')).toBeNull();
  expect(refKind('/robots.txt')).toBeNull();
  expect(refKind('/')).toBeNull();
  expect(refKind('')).toBeNull();
});

test('matchBook claims only book-level paths', () => {
  expect(matchBook('/Genesis')).toEqual({ title: 'Genesis' });
  expect(matchBook('/Genesis.1')).toBeNull();
  expect(matchBook('/texts')).toBeNull();
});

test('is fast enough for a route matcher', () => {
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) { refKind('/Rashi_on_Genesis.1.1'); refKind('/Not_A_Book_At_All_Really'); }
  expect(Date.now() - t0).toBeLessThan(500);
});
