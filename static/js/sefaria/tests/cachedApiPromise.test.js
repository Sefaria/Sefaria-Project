import Sefaria from '../sefaria';


describe("Sefaria._cachedApiPromise persistentStore integration", function() {
  const originalApiPromise = Sefaria._ApiPromise;

  afterEach(function() {
    Sefaria._ApiPromise = originalApiPromise;
    jest.clearAllMocks();
  });

  it("returns memory hits without reading IndexedDB or fetching", async function() {
    const store = {'/api/v3/texts/Genesis 1:1': {ref: 'Genesis 1:1'}};
    const persistentStore = {
      _inflight: {},
      get: jest.fn(),
      put: jest.fn(),
    };
    Sefaria._ApiPromise = jest.fn();

    await expect(Sefaria._cachedApiPromise({
      url: '/api/v3/texts/Genesis 1:1',
      key: '/api/v3/texts/Genesis 1:1',
      store,
      persistentStore,
    })).resolves.toEqual({ref: 'Genesis 1:1'});

    expect(persistentStore.get).not.toHaveBeenCalled();
    expect(Sefaria._ApiPromise).not.toHaveBeenCalled();
  });

  it("uses IndexedDB hits without fetching and populates memory", async function() {
    const store = {};
    const data = {ref: 'Exodus 1:1'};
    const persistentStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve(data)),
      put: jest.fn(),
    };
    Sefaria._ApiPromise = jest.fn();

    await expect(Sefaria._cachedApiPromise({
      url: '/api/v3/texts/Exodus 1:1',
      key: '/api/v3/texts/Exodus 1:1',
      store,
      persistentStore,
    })).resolves.toEqual(data);

    expect(store['/api/v3/texts/Exodus 1:1']).toEqual(data);
    expect(Sefaria._ApiPromise).not.toHaveBeenCalled();
    expect(persistentStore.put).not.toHaveBeenCalled();
  });

  it("fetches on a persistent miss and writes to both stores", async function() {
    const store = {};
    const data = {ref: 'Leviticus 1:1'};
    const persistentStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve(undefined)),
      put: jest.fn(() => Promise.resolve()),
    };
    Sefaria._ApiPromise = jest.fn(() => Promise.resolve(data));

    await expect(Sefaria._cachedApiPromise({
      url: '/api/v3/texts/Leviticus 1:1',
      key: '/api/v3/texts/Leviticus 1:1',
      store,
      persistentStore,
    })).resolves.toEqual(data);

    expect(Sefaria._ApiPromise).toHaveBeenCalledWith('/api/v3/texts/Leviticus 1:1');
    expect(store['/api/v3/texts/Leviticus 1:1']).toEqual(data);
    expect(persistentStore.put).toHaveBeenCalledWith('/api/v3/texts/Leviticus 1:1', data);
  });

  it("uses a separate persistent key when provided", async function() {
    const store = {};
    const data = {ref: 'Deuteronomy 1:1'};
    const persistentStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve(data)),
      put: jest.fn(),
    };
    Sefaria._ApiPromise = jest.fn();

    await expect(Sefaria._cachedApiPromise({
      url: '/api/texts/versions/Deuteronomy.1.1',
      key: 'Deuteronomy 1:1',
      store,
      persistentStore,
      persistentKey: '/api/texts/versions/Deuteronomy.1.1',
    })).resolves.toEqual(data);

    expect(persistentStore.get).toHaveBeenCalledWith('/api/texts/versions/Deuteronomy.1.1');
    expect(store['Deuteronomy 1:1']).toEqual(data);
    expect(Sefaria._ApiPromise).not.toHaveBeenCalled();
  });

  it("runs the processor on IndexedDB hits to warm secondary caches", async function() {
    const store = {};
    const persistentStore = {
      _inflight: {},
      get: jest.fn(() => Promise.resolve({raw: true})),
      put: jest.fn(),
    };
    const processor = jest.fn(data => ({processed: data.raw}));

    await expect(Sefaria._cachedApiPromise({
      url: '/api/related/Genesis.1?with_sheet_links=1',
      key: 'Genesis 1',
      store,
      persistentStore,
      persistentKey: '/api/related/Genesis.1?with_sheet_links=1',
      processor,
    })).resolves.toEqual({processed: true});

    expect(processor).toHaveBeenCalledWith({raw: true});
    expect(store['Genesis 1']).toEqual({processed: true});
  });

  it("fetches when IndexedDB lookup fails", async function() {
    const store = {};
    const data = {ref: 'Numbers 1:1'};
    const persistentStore = {
      _inflight: {},
      get: jest.fn(() => Promise.reject(new Error('idb unavailable'))),
      put: jest.fn(() => Promise.resolve()),
    };
    Sefaria._ApiPromise = jest.fn(() => Promise.resolve(data));

    await expect(Sefaria._cachedApiPromise({
      url: '/api/v3/texts/Numbers 1:1',
      key: '/api/v3/texts/Numbers 1:1',
      store,
      persistentStore,
    })).resolves.toEqual(data);

    expect(Sefaria._ApiPromise).toHaveBeenCalledWith('/api/v3/texts/Numbers 1:1');
    expect(store['/api/v3/texts/Numbers 1:1']).toEqual(data);
  });
});
