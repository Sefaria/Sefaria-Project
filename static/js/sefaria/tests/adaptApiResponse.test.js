import Sefaria from '../sefaria';

describe('v3 texts response adaptation', () => {
  test('each version carries the book title that version-notes links need', () => {
    const response = {
      indexTitle: 'Rashi on Genesis',
      versions: [
        { versionTitle: 'Version A', language: 'he', isPrimary: true, isSource: true, text: ['a'] },
        { versionTitle: 'Version B', language: 'en', isPrimary: false, isSource: false, text: ['b'] },
      ],
    };

    Sefaria._adaptApiResponse(response);

    expect(response.versions.map((version) => version.title)).toEqual(['Rashi on Genesis', 'Rashi on Genesis']);
  });

  test('keeps a title the version already carries', () => {
    const response = {
      indexTitle: 'Genesis',
      versions: [{ versionTitle: 'Version A', language: 'he', title: 'Bereshit', isSource: true, text: ['a'] }],
    };

    Sefaria._adaptApiResponse(response);

    expect(response.versions[0].title).toBe('Bereshit');
  });
});
