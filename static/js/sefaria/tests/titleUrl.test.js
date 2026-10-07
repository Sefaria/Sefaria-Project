import Sefaria from '../sefaria';

describe('title URL encoding', () => {
  test('encodes reader-title separators in one path segment', () => {
    const title = 'Book/Part\\Object?Edition%2F';
    const encoded = Sefaria.util.encodeTitleForUrl(title);

    expect(encoded).toBe('Book%2FPart%5CObject%3FEdition%252F');
    expect(new URL(`/${encoded}`, 'https://www.sefaria.org').pathname).toBe(`/${encoded}`);
  });

  test('known title parsing round-trips encoded slash and backslash', () => {
    const title = 'Book/Part\\Object';
    Sefaria.booksDict = {[title]: 1};
    Sefaria.virtualBooks = [];
    const urlTitle = Sefaria.util.encodeTitleForUrl(title);

    expect(Sefaria.parseRef(urlTitle).book).toBe(title);
    expect(Sefaria.humanRef(urlTitle)).toBe(title);
  });

  test('normRef fallback encodes separators in titles not parsed by the client', () => {
    Sefaria.booksDict = {};
    Sefaria.virtualBooks = [];
    expect(Sefaria.normRef('Unlisted/Book\\Part?Edition'))
      .toBe('Unlisted%2FBook%5CPart%3FEdition');
  });

  test('version URL params preserve encoded separators and embedded pipes', () => {
    const versionTitle = 'Version / Part\\Object?Edition&Notes#1;Alt|Copy';
    const encoded = Sefaria.util.encodeVtitle(versionTitle);
    const param = new URLSearchParams(`ven=family|${encoded}`).get('ven');

    expect(Sefaria.util.getObjectFromUrlParam(param)).toEqual({
      languageFamilyName: 'family',
      versionTitle: versionTitle.replace(/\s/g, '_'),
    });
  });
});
