import Sefaria from '../../../sefaria/sefaria';
import { classifyPath, matchReaderRef, urlToHumanRef, refToPath, hasBookData } from '../refKind';

describe('without book data (shape heuristic)', () => {
  beforeEach(() => { Sefaria.books = []; });

  test('claims section, segment and range refs in human form', () => {
    expect(hasBookData()).toBe(false);
    expect(matchReaderRef('/Genesis.1')).toEqual({ tref: 'Genesis 1', book: 'Genesis' });
    expect(matchReaderRef('/Genesis.1.3')).toEqual({ tref: 'Genesis 1:3', book: 'Genesis' });
    expect(matchReaderRef('/Genesis.1.3-5').tref).toBe('Genesis 1:3-5');
    expect(matchReaderRef('/Berakhot.2a').tref).toBe('Berakhot 2a');
    expect(matchReaderRef('/Berakhot.2a.3-2b.1').tref).toBe('Berakhot 2a:3-2b:1');
    expect(matchReaderRef('/Rashi_on_Genesis.1.1.1')).toEqual({ tref: 'Rashi on Genesis 1:1:1', book: 'Rashi on Genesis' });
    expect(matchReaderRef('/Shulchan_Arukh%2C_Orach_Chayim.1.1').tref).toBe('Shulchan Arukh, Orach Chayim 1:1');
  });

  test('leaves books, classic pages, files and deeper paths alone', () => {
    for (const p of ['/Genesis', '/Rashi_on_Genesis', '/login', '/texts', '/My', '/favicon.ico', '/data.js', '/a/b', '/', '/Genesis.1/extra']) {
      expect(matchReaderRef(p)).toBeNull();
    }
    expect(classifyPath('/Genesis')).toBeNull();   // cannot tell a book from a classic page without data
  });

  test('urlToHumanRef and refToPath round-trip', () => {
    expect(urlToHumanRef('Genesis.1.3-5')).toBe('Genesis 1:3-5');
    expect(urlToHumanRef('Rashi_on_Genesis.1.1.1')).toBe('Rashi on Genesis 1:1:1');
    expect(refToPath('Genesis 1:3-5')).toBe('/Genesis.1.3-5');
  });
});

describe('with book data (Sefaria.parseRef)', () => {
  beforeAll(() => {
    Sefaria.books = ['Genesis', 'Job', 'Berakhot', 'Rashi on Genesis'];
    Sefaria.virtualBooks = Sefaria.virtualBooks || [];
    Sefaria._makeBooksDict();
    Sefaria._parseRef = {};
    Sefaria.index('Genesis', { title: 'Genesis', categories: ['Tanakh', 'Torah'] });
    Sefaria.index('Rashi on Genesis', { title: 'Rashi on Genesis', categories: ['Tanakh', 'Rishonim on Tanakh'] });
  });
  afterAll(() => { Sefaria.books = []; Sefaria._makeBooksDict(); Sefaria._parseRef = {}; });

  test('book-level refs are classified but not matched', () => {
    expect(classifyPath('/Genesis')).toEqual({ tref: 'Genesis', kind: 'book', book: 'Genesis', index: 'Genesis' });
    expect(classifyPath('/Rashi_on_Genesis').kind).toBe('book');
    expect(matchReaderRef('/Genesis')).toBeNull();
    expect(matchReaderRef('/Rashi_on_Genesis')).toBeNull();
  });

  test('sectioned refs match in human form; unknown titles fall through', () => {
    expect(matchReaderRef('/Genesis.1')).toEqual({ tref: 'Genesis 1', book: 'Genesis' });
    expect(matchReaderRef('/Genesis.1.1-3').tref).toBe('Genesis 1:1-3');
    expect(matchReaderRef('/Berakhot.2a').tref).toBe('Berakhot 2a');
    expect(matchReaderRef('/Rashi_on_Genesis.1.1.1').tref).toBe('Rashi on Genesis 1:1:1');
    expect(matchReaderRef('/Jobs.1')).toBeNull();
    expect(matchReaderRef('/Nonsense.1')).toBeNull();
    expect(matchReaderRef('/Genesis.x')).toBeNull();
    expect(matchReaderRef('/sheets')).toBeNull();
    expect(refToPath('Rashi on Genesis 1:1:1')).toBe('/Rashi_on_Genesis.1.1.1');
  });
});
