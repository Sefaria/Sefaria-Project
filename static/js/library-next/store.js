/**
 * Local persistence for Library Next: versioned collections and a key/value area, both in
 * `localStorage` under `sefaria.libnext.<name>`.
 *
 *   import { createCollection, useCollection, kv, exportAll, importAll } from '../store';
 *   const notes = createCollection('notes', { version: 2, migrate: (items, from) => items });
 *   notes.put({ ref: 'Genesis 1:1', text: '...' });   // assigns `id` + `ts` when missing
 *   notes.list(); notes.get(id); notes.remove(id); notes.subscribe(fn);
 *   const { items, put, remove } = useCollection('notes');   // re-renders on change, any tab
 *   kv.get('contentLang', 'bi'); kv.set('contentLang', 'he');
 *   exportAll() → JSON string of everything; importAll(json) restores it.
 *
 * Writes are debounced (`WRITE_DELAY_MS`) and flushed on `pagehide`; reads come from memory.
 * Every change fires a `libnext:store` event on `window` (this tab) and the native `storage`
 * event keeps other tabs in sync.
 */
import { useEffect, useState } from 'react';

export const PREFIX = 'sefaria.libnext.';
export const WRITE_DELAY_MS = 150;
const KV_NAME = 'kv';
const CHANGE_EVENT = 'libnext:store';

const collections = new Map();

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (e) {
    return null;   // privacy mode: keep everything in memory
  }
}

function readRaw(key) {
  const s = storage();
  if (!s) { return null; }
  try {
    const raw = s.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeRaw(key, value) {
  const s = storage();
  if (!s) { return; }
  try {
    s.setItem(key, JSON.stringify(value));
  } catch (e) {
    // quota exceeded or disabled storage: the in-memory copy still serves this session
  }
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function emit(name) {
  if (typeof window === 'undefined') { return; }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { name } }));
}

class Collection {
  constructor(name, { version = 1, migrate = null } = {}) {
    this.name = name;
    this.key = PREFIX + name;
    this.version = version;
    this.migrate = migrate;
    this.listeners = new Set();
    this.timer = null;
    this.load();
  }

  load() {
    const raw = readRaw(this.key);
    let items = raw && raw.items && typeof raw.items === 'object' ? raw.items : {};
    const from = raw && typeof raw.v === 'number' ? raw.v : 0;
    if (raw && from !== this.version) {
      items = this.migrate ? (this.migrate(items, from) || {}) : items;
      this.items = items;
      this.write();   // persist the migrated shape right away
      return;
    }
    this.items = items;
  }

  list() {
    return Object.values(this.items).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  get(id) {
    return this.items[id] || null;
  }

  put(item) {
    const stored = { ...item, id: item.id || newId(), ts: item.ts || Date.now() };
    this.items = { ...this.items, [stored.id]: stored };
    this.scheduleWrite();
    this.notify();
    return stored;
  }

  remove(id) {
    if (!(id in this.items)) { return false; }
    const { [id]: gone, ...rest } = this.items;
    this.items = rest;
    this.scheduleWrite();
    this.notify();
    return true;
  }

  clear() {
    this.items = {};
    this.scheduleWrite();
    this.notify();
  }

  replaceAll(items) {
    this.items = { ...(items || {}) };
    this.write();
    this.notify();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    [...this.listeners].forEach(fn => fn(this));   // a copy: listeners may re-subscribe while being notified
    emit(this.name);
  }

  scheduleWrite() {
    if (this.timer) { clearTimeout(this.timer); }
    this.timer = setTimeout(() => this.write(), WRITE_DELAY_MS);
  }

  write() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    writeRaw(this.key, { v: this.version, items: this.items });
  }

  /** Another tab changed this collection: reload and notify, without writing back. */
  reloadFromStorage() {
    const raw = readRaw(this.key);
    this.items = raw && raw.items ? raw.items : {};
    this.listeners.forEach(fn => fn(this));
  }
}

/**
 * Get or create a named collection. Later calls with the same name return the same instance; a
 * call with a higher `version` migrates it in place (see below).
 */
export function createCollection(name, options = {}) {
  const existing = collections.get(name);
  if (!existing) {
    collections.set(name, new Collection(name, options));
    return collections.get(name);
  }
  // A later caller that knows a newer schema (and its migration) upgrades the instance in place,
  // so the order in which features happen to load never decides a collection's version.
  if (typeof options.version === 'number' && options.version > existing.version) {
    if (existing.timer) { existing.write(); }
    existing.version = options.version;
    existing.migrate = options.migrate || existing.migrate;
    existing.load();
    existing.notify();
  }
  return existing;
}

export function getCollection(name) {
  return collections.get(name) || null;
}

/** Write every pending change now (called on pagehide; useful in tests). */
export function flush() {
  collections.forEach(c => { if (c.timer) { c.write(); } });
}

// Key/value area: one collection whose items are `{ id: key, value }`.
const kvCollection = () => createCollection(KV_NAME, { version: 1 });

export const kv = {
  get(key, fallback = null) {
    const item = kvCollection().get(key);
    return item ? item.value : fallback;
  },
  set(key, value) {
    kvCollection().put({ id: key, value, ts: Date.now() });
  },
  remove(key) {
    kvCollection().remove(key);
  },
  subscribe(fn) {
    return kvCollection().subscribe(fn);
  },
};

/** Everything under the prefix, as a JSON string suitable for a download. */
export function exportAll() {
  flush();
  const s = storage();
  const data = {};
  if (s) {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith(PREFIX)) {
        data[key.slice(PREFIX.length)] = readRaw(key);
      }
    }
  }
  return JSON.stringify({ format: 'sefaria.libnext', exportedAt: new Date().toISOString(), data }, null, 2);
}

/**
 * Restore an `exportAll()` payload. Replaces each collection it names; with `merge: true` items
 * are added to what is already there (existing ids win). Returns the collection names restored.
 */
export function importAll(json, { merge = false } = {}) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (!parsed || parsed.format !== 'sefaria.libnext' || !parsed.data) {
    throw new Error('Not a Library export');
  }
  const names = [];
  for (const [name, raw] of Object.entries(parsed.data)) {
    if (!raw || typeof raw !== 'object') { continue; }
    const incoming = raw.items || {};
    const existing = collections.get(name);
    if (existing) {
      existing.replaceAll(merge ? { ...incoming, ...existing.items } : incoming);
    } else {
      const current = merge ? ((readRaw(PREFIX + name) || {}).items || {}) : {};
      writeRaw(PREFIX + name, { v: raw.v || 1, items: { ...incoming, ...current } });
      emit(name);
    }
    names.push(name);
  }
  return names;
}

/** Test helper: drop every in-memory collection (storage is left alone). */
export function _resetStore() {
  collections.forEach(c => { if (c.timer) { clearTimeout(c.timer); } });
  collections.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(PREFIX)) { return; }
    const c = collections.get(e.key.slice(PREFIX.length));
    if (c) { c.reloadFromStorage(); }
  });
}

/**
 * React hook over a collection: `{ items, get, put, remove, clear, collection }`. Re-renders when
 * the collection changes in this tab or another.
 */
export function useCollection(name, options) {
  const collection = createCollection(name, options);
  const [items, setItems] = useState(() => collection.list());
  useEffect(() => collection.subscribe(c => setItems(c.list())), [collection]);
  return {
    items,
    get: id => collection.get(id),
    put: item => collection.put(item),
    remove: id => collection.remove(id),
    clear: () => collection.clear(),
    collection,
  };
}

/** React hook over one kv key: `[value, set]`. */
export function useKv(key, fallback = null) {
  const [value, setValue] = useState(() => kv.get(key, fallback));
  useEffect(() => kv.subscribe(() => setValue(kv.get(key, fallback))), [key, fallback]);
  return [value, next => kv.set(key, next)];
}
