import {
  BROWSE_URL, bookTocUrl, buildReaderUrl, classicReaderUrl, decodeVersionTitle, encodeVersionTitle,
  normalizeCurrVersions, refToUrlPath, searchInBookUrl,
} from '../url';

describe('refToUrlPath', () => {
  test.each([
    ['Genesis 1', 'Genesis.1'],
    ['Genesis 1:3', 'Genesis.1.3'],
    ['Genesis 1:3-5', 'Genesis.1.3-5'],
    ['Genesis 1:3-2:4', 'Genesis.1.3-2.4'],
    ['Berakhot 2a', 'Berakhot.2a'],
    ['Berakhot 2a:4', 'Berakhot.2a.4'],
    ['Shir HaShirim 2:1', 'Shir_HaShirim.2.1'],
    ['Mishneh Torah, Prayer and the Priestly Blessing 1:1', 'Mishneh_Torah,_Prayer_and_the_Priestly_Blessing.1.1'],
    ['Pirkei Avot 1', 'Pirkei_Avot.1'],
  ])('%s -> %s', (ref, path) => {
    expect(refToUrlPath(ref)).toBe(path);
  });
});

describe('buildReaderUrl uses the classic grammar', () => {
  test('no versions: only the language', () => {
    expect(buildReaderUrl({ref: 'Genesis 1', currVersions: {en: {languageFamilyName: '', versionTitle: ''}}, language: 'bilingual'}))
      .toBe('/Genesis.1?lang=bi');
    expect(buildReaderUrl({ref: 'Berakhot 2a', currVersions: null, language: 'hebrew'})).toBe('/Berakhot.2a?lang=he');
  });

  test('versions come first (ven, then vhe), with titles encoded as Sefaria.util.encodeVtitle', () => {
    const currVersions = {
      he: {languageFamilyName: 'hebrew', versionTitle: 'Miqra according to the Masorah'},
      en: {languageFamilyName: 'english', versionTitle: 'The Koren Jerusalem Bible; 2nd ed'},
    };
    expect(buildReaderUrl({ref: 'Genesis 1:3', currVersions, language: 'english'}))
      .toBe('/Genesis.1.3?ven=english|The_Koren_Jerusalem_Bible%3B_2nd_ed&vhe=hebrew|Miqra_according_to_the_Masorah&lang=en');
  });

  test('with= is carried while connections are open', () => {
    expect(buildReaderUrl({ref: 'Genesis 1:3', currVersions: {}, language: 'bilingual', connections: 'Rashi on Genesis'}))
      .toBe('/Genesis.1.3?with=Rashi_on_Genesis&lang=bi');
  });

  test('version titles round-trip', () => {
    const title = 'The Koren Jerusalem Bible; 2nd ed';
    expect(decodeVersionTitle(encodeVersionTitle(title))).toBe(title);
    expect(normalizeCurrVersions({en: {versionTitle: ''}, he: {languageFamilyName: 'hebrew', versionTitle: 'X'}}))
      .toEqual({en: null, he: {languageFamilyName: 'hebrew', versionTitle: 'X'}});
  });
});

describe('links out of the reader', () => {
  test('search in book, contents and browse', () => {
    expect(searchInBookUrl({categories: ['Tanakh', 'Torah'], indexTitle: 'Genesis'}))
      .toBe('/search?q=&tab=text&tvar=1&tsort=relevance&tpathFilters=Tanakh%2FTorah%2FGenesis');
    expect(bookTocUrl('Shir HaShirim')).toBe('/Shir_HaShirim');
    expect(BROWSE_URL).toBe('/texts');
  });

  test('the classic reader opt-out', () => {
    expect(classicReaderUrl('/Genesis.1?lang=bi')).toBe('/Genesis.1?lang=bi&ng=0');
    expect(classicReaderUrl('/Genesis.1')).toBe('/Genesis.1?ng=0');
  });
});
