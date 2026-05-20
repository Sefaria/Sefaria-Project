import { PersistentApiCache } from '../persistentCache';


const dbName = () => `sefaria-api-cache-test-${Date.now()}-${Math.random()}`;


describe("PersistentApiCache", function() {
  it("returns undefined on a miss", async function() {
    const cache = new PersistentApiCache({dbName: dbName()});

    await expect(cache.get('/api/v3/texts/Genesis 1')).resolves.toBeUndefined();
  });

  it("round-trips data through IndexedDB", async function() {
    const cache = new PersistentApiCache({dbName: dbName()});
    const data = {ref: 'Genesis 1:1', text: ['In the beginning']};

    await cache.put('/api/v3/texts/Genesis 1:1', data);

    await expect(cache.get('/api/v3/texts/Genesis 1:1')).resolves.toEqual(data);
  });

  it("deletes and misses expired rows", async function() {
    const cache = new PersistentApiCache({dbName: dbName(), ttlMs: 10});
    const db = cache._getDB();
    const url = '/api/v3/texts/expired';

    await db[cache.tableName].put({
      url,
      data: {ref: 'expired'},
      cachedAt: Date.now() - 1000,
      schemaVersion: cache.schemaVersion,
    });

    await expect(cache.get(url)).resolves.toBeUndefined();
    await expect(db[cache.tableName].get(url)).resolves.toBeUndefined();
  });

  it("deletes and misses rows from an old schema version", async function() {
    const cache = new PersistentApiCache({dbName: dbName(), schemaVersion: 2});
    const db = cache._getDB();
    const url = '/api/v3/texts/old-schema';

    await db[cache.tableName].put({
      url,
      data: {ref: 'old-schema'},
      cachedAt: Date.now(),
      schemaVersion: 1,
    });

    await expect(cache.get(url)).resolves.toBeUndefined();
    await expect(db[cache.tableName].get(url)).resolves.toBeUndefined();
  });

  it("returns undefined when IndexedDB is unavailable", async function() {
    const originalIndexedDB = global.indexedDB;
    try {
      delete global.indexedDB;
      const cache = new PersistentApiCache({dbName: dbName()});

      await expect(cache.get('/api/v3/texts/no-idb')).resolves.toBeUndefined();
      await expect(cache.put('/api/v3/texts/no-idb', {ref: 'no-idb'})).resolves.toBeUndefined();
    } finally {
      global.indexedDB = originalIndexedDB;
    }
  });

  it("evicts the oldest rows when the row cap is exceeded", async function() {
    const cache = new PersistentApiCache({dbName: dbName(), maxRows: 2});
    const db = cache._getDB();
    const now = Date.now();

    await db[cache.tableName].bulkPut([
      {
        url: '/api/v3/texts/oldest',
        data: {ref: 'oldest'},
        cachedAt: now - 3,
        schemaVersion: cache.schemaVersion,
      },
      {
        url: '/api/v3/texts/middle',
        data: {ref: 'middle'},
        cachedAt: now - 2,
        schemaVersion: cache.schemaVersion,
      },
      {
        url: '/api/v3/texts/newest',
        data: {ref: 'newest'},
        cachedAt: now - 1,
        schemaVersion: cache.schemaVersion,
      },
    ]);
    await cache._enforceMaxRows(db);

    await expect(cache.get('/api/v3/texts/oldest')).resolves.toBeUndefined();
    await expect(cache.get('/api/v3/texts/middle')).resolves.toEqual({ref: 'middle'});
    await expect(cache.get('/api/v3/texts/newest')).resolves.toEqual({ref: 'newest'});
  });

  it("records downloaded books for offline navigation", async function() {
    const cache = new PersistentApiCache({dbName: dbName()});

    await cache.putDownloadedBook({
      title: 'Genesis',
      sectionRefs: ['Genesis 1'],
      urls: ['/texts', '/texts/Tanakh', '/Genesis?tab=contents'],
    });

    await expect(cache.getDownloadedBooks()).resolves.toMatchObject([{
      title: 'Genesis',
      sectionRefs: ['Genesis 1'],
      urls: ['/texts', '/texts/Tanakh', '/Genesis?tab=contents'],
      schemaVersion: cache.schemaVersion,
    }]);
    await expect(cache.getDownloadedBook('Genesis')).resolves.toMatchObject({
      title: 'Genesis',
      sectionRefs: ['Genesis 1'],
    });
  });
});
