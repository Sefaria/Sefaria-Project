import Sefaria from '../sefaria';


describe("persistent API cache integrations", function() {
  const originalApiPromise = Sefaria._ApiPromise;
  const originalVersionsStore = Sefaria._persistentVersionsStore;
  const originalTextsStore = Sefaria._persistentTextsStore;
  const originalRelatedStore = Sefaria._persistentRelatedStore;
  const originalSaveRelatedData = Sefaria._saveRelatedData;
  const originalVirtualBooks = Sefaria.virtualBooks;
  const originalBooksDict = Sefaria.booksDict;

  beforeEach(function() {
    Sefaria.apiHost = '';
    Sefaria.virtualBooks = [];
    Sefaria.booksDict = {Genesis: 1, "Ibn Ezra on Genesis": 1};
    Sefaria._versions = {};
    Sefaria._translateVersions = {};
    Sefaria._related = {};
    Sefaria._textsStore = {};
  });

  afterEach(function() {
    Sefaria._ApiPromise = originalApiPromise;
    Sefaria._persistentVersionsStore = originalVersionsStore;
    Sefaria._persistentTextsStore = originalTextsStore;
    Sefaria._persistentRelatedStore = originalRelatedStore;
    Sefaria._saveRelatedData = originalSaveRelatedData;
    Sefaria.virtualBooks = originalVirtualBooks;
    Sefaria.booksDict = originalBooksDict;
    jest.clearAllMocks();
  });

  it("loads versions from IndexedDB beneath the versions memory cache", async function() {
    const cachedVersions = {
      en: [{versionTitle: 'Cached Version', language: 'en'}],
    };
    Sefaria._persistentVersionsStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve(cachedVersions)),
      put: jest.fn(),
    };
    Sefaria._ApiPromise = jest.fn();

    await expect(Sefaria.getVersions('Genesis 29')).resolves.toEqual(cachedVersions);

    expect(Sefaria._persistentVersionsStore.get)
      .toHaveBeenCalledWith('/api/texts/versions/Genesis.29');
    expect(Sefaria._ApiPromise).not.toHaveBeenCalled();
    expect(Sefaria._versions['Genesis 29']).toEqual(cachedVersions);
    expect(Sefaria._translateVersions['Cached Version|en']).toEqual({
      en: 'Cached Version',
      he: 'Cached Version',
    });
  });

  it("fetches versions on an IndexedDB miss and persists the bucketed result by API URL", async function() {
    const apiVersions = [{versionTitle: 'Network Version', language: 'en'}];
    Sefaria._persistentVersionsStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve(undefined)),
      put: jest.fn(() => Promise.resolve()),
    };
    Sefaria._ApiPromise = jest.fn(() => Promise.resolve(apiVersions));

    const versions = await Sefaria.getVersions('Genesis 29');

    expect(Sefaria._ApiPromise).toHaveBeenCalledWith('/api/texts/versions/Genesis.29');
    expect(versions.en[0].versionTitle).toBe('Network Version');
    expect(Sefaria._persistentVersionsStore.put)
      .toHaveBeenCalledWith('/api/texts/versions/Genesis.29', versions);
  });

  it("uses section-level IndexedDB versions for segment-level version requests", async function() {
    const sectionVersions = {
      he: [{versionTitle: 'Piotrkow, 1907-1911', language: 'he'}],
    };
    Sefaria._persistentVersionsStore = {
      _inflight: {},
      get: jest.fn(url => Promise.resolve(
        url === '/api/texts/versions/Ibn_Ezra_on_Genesis.3' ? sectionVersions : undefined
      )),
      put: jest.fn(() => Promise.resolve()),
    };
    Sefaria._ApiPromise = jest.fn();

    await expect(Sefaria.getVersions('Ibn Ezra on Genesis 3:22')).resolves.toEqual(sectionVersions);

    expect(Sefaria._persistentVersionsStore.get)
      .toHaveBeenCalledWith('/api/texts/versions/Ibn_Ezra_on_Genesis.3.22');
    expect(Sefaria._persistentVersionsStore.get)
      .toHaveBeenCalledWith('/api/texts/versions/Ibn_Ezra_on_Genesis.3');
    expect(Sefaria._ApiPromise).not.toHaveBeenCalled();
  });

  it("extracts segment-level v3 text from a section-level IndexedDB text response", async function() {
    const requiredVersions = [{languageFamilyName: 'primary'}];
    const sectionUrl = Sefaria.makeUrlForAPIV3Text('Ibn Ezra on Genesis 3', requiredVersions, true, 'wrap_all_entities');
    const sectionData = {
      ref: 'Ibn Ezra on Genesis 3',
      sectionRef: 'Ibn Ezra on Genesis 3',
      textDepth: 2,
      sections: [3],
      toSections: [3],
      versions: [{
        languageFamilyName: 'hebrew',
        text: ['one', 'two', 'three'],
      }],
    };
    Sefaria._persistentTextsStore = {
      _inflight: {},
      get: jest.fn(url => Promise.resolve(url === sectionUrl ? sectionData : undefined)),
      put: jest.fn(() => Promise.resolve()),
    };
    Sefaria._ApiPromise = jest.fn();

    const data = await Sefaria.getTextsFromAPIV3('Ibn Ezra on Genesis 3:3', requiredVersions, true, 'wrap_all_entities');

    expect(data.ref).toBe('Ibn Ezra on Genesis 3:3');
    expect(data.sectionRef).toBe('Ibn Ezra on Genesis 3');
    expect(data.versions[0].text).toBe('three');
    expect(Sefaria._ApiPromise).not.toHaveBeenCalled();
  });

  it("loads related data from IndexedDB beneath the related memory cache", async function() {
    const cachedRelated = {
      links: [],
      notes: [],
      sheets: [],
      topics: [],
      media: [],
      manuscripts: [],
      guides: [],
    };
    const callback = jest.fn();
    Sefaria._persistentRelatedStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve(cachedRelated)),
      put: jest.fn(),
    };
    Sefaria._ApiPromise = jest.fn();
    Sefaria._saveRelatedData = jest.fn((ref, data) => {
      Sefaria._related[ref] = data;
      return data;
    });

    await Sefaria.relatedApi('Genesis 29', callback);

    expect(Sefaria._persistentRelatedStore.get)
      .toHaveBeenCalledWith('/api/related/Genesis.29?with_sheet_links=1');
    expect(Sefaria._ApiPromise).not.toHaveBeenCalled();
    expect(Sefaria._saveRelatedData).toHaveBeenCalledWith('Genesis 29', cachedRelated);
    expect(callback).toHaveBeenCalledWith(cachedRelated);
  });

  it("fetches related data on an IndexedDB miss and persists it by API URL", async function() {
    const apiRelated = {
      links: [],
      notes: [],
      sheets: [],
      topics: [],
      media: [],
      manuscripts: [],
      guides: [],
    };
    const callback = jest.fn();
    Sefaria._persistentRelatedStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve(undefined)),
      put: jest.fn(() => Promise.resolve()),
    };
    Sefaria._ApiPromise = jest.fn(() => Promise.resolve(apiRelated));
    Sefaria._saveRelatedData = jest.fn((ref, data) => {
      Sefaria._related[ref] = data;
      return data;
    });

    await Sefaria.relatedApi('Genesis 29', callback);

    expect(Sefaria._ApiPromise).toHaveBeenCalledWith('/api/related/Genesis.29?with_sheet_links=1');
    expect(Sefaria._persistentRelatedStore.put)
      .toHaveBeenCalledWith('/api/related/Genesis.29?with_sheet_links=1', apiRelated);
    expect(callback).toHaveBeenCalledWith(apiRelated);
  });
});
