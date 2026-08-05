import Dexie from 'dexie';


export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SCHEMA_VERSION = 1;
export const MAX_ROWS = 5000;

const ENABLED = true;


export class PersistentApiCache {
  constructor({
    dbName = 'sefaria-api-cache',
    tableName = 'responses',
    ttlMs = CACHE_TTL_MS,
    schemaVersion = SCHEMA_VERSION,
    maxRows = MAX_ROWS,
  } = {}) {
    this.dbName = dbName;
    this.tableName = tableName;
    this.ttlMs = ttlMs;
    this.schemaVersion = schemaVersion;
    this.maxRows = maxRows;
    this._db = null;
    this._inflight = {};
  }

  _isAvailable() {
    return ENABLED && typeof indexedDB !== 'undefined';
  }

  _getDB() {
    if (!this._isAvailable()) { return null; }
    if (this._db) { return this._db; }

    const db = new Dexie(this.dbName);
    db.version(1).stores({
      [this.tableName]: 'url, cachedAt, schemaVersion',
    });
    db.version(2).stores({
      [this.tableName]: 'url, cachedAt, schemaVersion',
      downloadedBooks: 'title, downloadedAt',
    });
    this._db = db;
    return this._db;
  }

  async get(url) {
    try {
      const db = this._getDB();
      if (!db) { return undefined; }

      const row = await db[this.tableName].get(url);
      if (!row) { return undefined; }

      const expired = row.cachedAt + this.ttlMs < Date.now();
      const schemaMismatch = row.schemaVersion !== this.schemaVersion;
      if (expired || schemaMismatch) {
        await db[this.tableName].delete(url);
        return undefined;
      }

      return row.data;
    } catch (e) {
      return undefined;
    }
  }

  async getByUrlPrefix(prefix) {
    try {
      const db = this._getDB();
      if (!db) { return undefined; }

      const rows = await db[this.tableName]
        .where('url')
        .startsWith(prefix)
        .reverse()
        .sortBy('cachedAt');
      for (let row of rows) {
        const expired = row.cachedAt + this.ttlMs < Date.now();
        const schemaMismatch = row.schemaVersion !== this.schemaVersion;
        if (expired || schemaMismatch) {
          await db[this.tableName].delete(row.url);
          continue;
        }
        return row.data;
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  async put(url, data) {
    try {
      const db = this._getDB();
      if (!db) { return; }

      await db[this.tableName].put({
        url,
        data,
        cachedAt: Date.now(),
        schemaVersion: this.schemaVersion,
      });
      await this._enforceMaxRows(db);
    } catch (e) {
      return;
    }
  }

  async clear() {
    try {
      const db = this._getDB();
      if (!db) { return; }
      await db[this.tableName].clear();
    } catch (e) {
      return;
    }
  }

  async putDownloadedBook(book) {
    try {
      const db = this._getDB();
      if (!db) { return; }
      await db.downloadedBooks.put({
        ...book,
        downloadedAt: Date.now(),
        schemaVersion: this.schemaVersion,
      });
    } catch (e) {
      return;
    }
  }

  async getDownloadedBooks() {
    try {
      const db = this._getDB();
      if (!db) { return []; }
      return await db.downloadedBooks.orderBy('downloadedAt').reverse().toArray();
    } catch (e) {
      return [];
    }
  }

  async getDownloadedBook(title) {
    try {
      const db = this._getDB();
      if (!db) { return undefined; }
      return await db.downloadedBooks.get(title);
    } catch (e) {
      return undefined;
    }
  }

  async _enforceMaxRows(db) {
    try {
      if (!this.maxRows) { return; }
      const count = await db[this.tableName].count();
      const excess = count - this.maxRows;
      if (excess <= 0) { return; }

      const oldestKeys = await db[this.tableName]
        .orderBy('cachedAt')
        .limit(excess)
        .primaryKeys();
      await db[this.tableName].bulkDelete(oldestKeys);
    } catch (e) {
      return;
    }
  }
}


export default new PersistentApiCache();
