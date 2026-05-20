import Sefaria from '../sefaria';


describe("offline book download helpers", function() {
  const originalGetIndexDetails = Sefaria.getIndexDetails;
  const originalDownloadRefForOffline = Sefaria._downloadRefForOffline;
  const originalGetVersions = Sefaria.getVersions;
  const originalDownloadVersionsForOffline = Sefaria.downloadVersionsForOffline;
  const originalPersistentVersionsStore = Sefaria._persistentVersionsStore;
  const originalGetTextsFromAPIV3 = Sefaria.getTextsFromAPIV3;
  const originalGetTextFromCurrVersions = Sefaria.getTextFromCurrVersions;
  const originalRelatedApi = Sefaria.relatedApi;
  const originalApiHost = Sefaria.apiHost;
  const originalVirtualBooks = Sefaria.virtualBooks;
  const originalBooksDict = Sefaria.booksDict;

  beforeEach(function() {
    Sefaria.apiHost = '';
    Sefaria.virtualBooks = [];
    Sefaria.booksDict = {Genesis: 1};
  });

  afterEach(function() {
    Sefaria.getIndexDetails = originalGetIndexDetails;
    Sefaria._downloadRefForOffline = originalDownloadRefForOffline;
    Sefaria.getVersions = originalGetVersions;
    Sefaria.downloadVersionsForOffline = originalDownloadVersionsForOffline;
    Sefaria._persistentVersionsStore = originalPersistentVersionsStore;
    Sefaria.getTextsFromAPIV3 = originalGetTextsFromAPIV3;
    Sefaria.getTextFromCurrVersions = originalGetTextFromCurrVersions;
    Sefaria.relatedApi = originalRelatedApi;
    Sefaria.apiHost = originalApiHost;
    Sefaria.virtualBooks = originalVirtualBooks;
    Sefaria.booksDict = originalBooksDict;
    jest.clearAllMocks();
  });

  it("derives section refs from simple book content counts", async function() {
    Sefaria.getIndexDetails = jest.fn(() => Promise.resolve({
      title: 'Genesis',
      schema: {
        nodeType: 'JaggedArrayNode',
        depth: 2,
        addressTypes: ['Integer', 'Integer'],
        content_counts: [31, 25, 24],
      },
    }));

    await expect(Sefaria.getBookSectionRefsForDownload('Genesis'))
      .resolves.toEqual(['Genesis 1', 'Genesis 2', 'Genesis 3']);
  });

  it("derives section refs from nested content counts", async function() {
    Sefaria.getIndexDetails = jest.fn(() => Promise.resolve({
      title: 'Complex Text',
      schema: {
        nodes: [{
          nodeType: 'JaggedArrayNode',
          title: 'Part One',
          depth: 2,
          addressTypes: ['Integer', 'Integer'],
          content_counts: [2, 0, 3],
        }],
      },
    }));

    await expect(Sefaria.getBookSectionRefsForDownload('Complex Text'))
      .resolves.toEqual(['Complex Text, Part One 1', 'Complex Text, Part One 3']);
  });

  it("downloads every derived ref with progress updates", async function() {
    const progress = jest.fn();
    Sefaria.getIndexDetails = jest.fn(() => Promise.resolve({
      title: 'Genesis',
      schema: {
        nodeType: 'JaggedArrayNode',
        depth: 2,
        addressTypes: ['Integer', 'Integer'],
        content_counts: [31, 25],
      },
    }));
    Sefaria._downloadRefForOffline = jest.fn(ref => Promise.resolve(ref));
    const currVersions = {en: {languageFamilyName: 'translation'}};

    await expect(Sefaria.downloadBookForOffline('Genesis', {onProgress: progress, concurrency: 1, currVersions}))
      .resolves.toEqual({bookTitle: 'Genesis', total: 2, completed: 2});

    expect(Sefaria._downloadRefForOffline).toHaveBeenCalledWith('Genesis 1', {
      currVersions,
      translationLanguagePreference: null,
    });
    expect(Sefaria._downloadRefForOffline).toHaveBeenCalledWith('Genesis 2', {
      currVersions,
      translationLanguagePreference: null,
    });
    expect(progress).toHaveBeenLastCalledWith({
      bookTitle: 'Genesis',
      total: 2,
      completed: 2,
      currentRef: 'Genesis 2',
    });
  });

  it("persists versions to IndexedDB even when versions are already in memory", async function() {
    const versions = {en: [{versionTitle: 'Cached Version', language: 'en'}]};
    Sefaria.getVersions = jest.fn(() => Promise.resolve(versions));
    Sefaria._persistentVersionsStore = {
      put: jest.fn(() => Promise.resolve()),
    };

    await expect(Sefaria.downloadVersionsForOffline('Genesis 31')).resolves.toEqual(versions);

    expect(Sefaria.getVersions).toHaveBeenCalledWith('Genesis 31');
    expect(Sefaria._persistentVersionsStore.put)
      .toHaveBeenCalledWith('/api/texts/versions/Genesis.31', versions);
  });

  it("warms versions, text, and related caches for a section ref", async function() {
    const currVersions = {en: {languageFamilyName: 'translation'}};
    Sefaria.downloadVersionsForOffline = jest.fn(() => Promise.resolve({}));
    Sefaria.getTextFromCurrVersions = jest.fn(() => Promise.resolve({}));
    Sefaria.relatedApi = jest.fn(() => Promise.resolve({}));

    await expect(Sefaria._downloadRefForOffline('Genesis 31', {currVersions, translationLanguagePreference: 'en'})).resolves.toBe('Genesis 31');

    expect(Sefaria.downloadVersionsForOffline).toHaveBeenCalledWith('Genesis 31');
    expect(Sefaria.getTextFromCurrVersions).toHaveBeenCalledWith(
      'Genesis 31',
      currVersions,
      'en',
      false
    );
    expect(Sefaria.relatedApi).toHaveBeenCalledWith('Genesis 31');
  });
});
