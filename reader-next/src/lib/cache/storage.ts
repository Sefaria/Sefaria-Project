/**
 * IndexedDB storage for persisted queries. Values are stored as structured clones (no JSON round trip).
 * Returns `undefined` where IndexedDB is unavailable (server render, some private modes) so the cache
 * degrades to memory-only.
 *
 * Disk use is bounded (CODE_REVIEW R-11): every write also records a small metadata row (size, last use) in a separate database, so
 * a sweep can expire and evict entries without reading the values themselves (TanStack's own persisterGc loads every value, and was
 * never called at all: the disk cache only grew, until the browser's quota stopped every write — silently).
 */
import { createStore, del, entries, get, keys, set, type UseStore } from "idb-keyval";
import type { AsyncStorage, PersistedQuery } from "@tanstack/query-persist-client-core";

export const DB_NAME = "sefaria-reader";
export const STORE_NAME = "queries";
const META_DB = "sefaria-reader-meta";
const META_STORE = "meta";

export interface DiskEntryMeta {
  /** Approximate size in bytes (the value's JSON length). */
  size: number;
  /** Last written or read. */
  at: number;
  /** When the stored data was fetched (its `dataUpdatedAt`): lets a writer see the disk already has it, without reading the value. */
  updated?: number;
}

let store: UseStore | undefined;
let metaStore: UseStore | undefined;

/**
 * Set once a disk call has timed out (T-E04): IndexedDB that hangs once in a session hangs again, so for the rest of the visit the
 * cache is memory-only and nothing waits on the disk again.
 */
let diskDead = false;
export const isDiskDead = (): boolean => diskDead;

function getStore(): UseStore | undefined {
  if (typeof indexedDB === "undefined" || diskDead) return undefined;
  store ??= createStore(DB_NAME, STORE_NAME);
  return store;
}
function getMetaStore(): UseStore | undefined {
  if (typeof indexedDB === "undefined" || diskDead) return undefined;
  metaStore ??= createStore(META_DB, META_STORE);
  return metaStore;
}

/** An estimate of a value's size, without serialising it: string lengths plus a little per entry (enough to budget a cache). */
function sizeOf(value: unknown, depth = 0): number {
  if (typeof value === "string") return value.length + 2;
  if (value === null || typeof value !== "object" || depth > 32) return 8;
  let n = 2;
  if (Array.isArray(value)) for (const v of value) n += sizeOf(v, depth + 1) + 1;
  else for (const k in value as Record<string, unknown>) n += k.length + 4 + sizeOf((value as Record<string, unknown>)[k], depth + 1);
  return n;
}

/**
 * How long a disk read may take before the reader stops waiting for it and goes to the network. IndexedDB can hang rather than fail
 * (WebKit has shipped versions whose first `open` after launch never answered; a busy disk on a cheap phone): the text must never wait
 * on the cache (T-E04).
 */
export const DISK_READ_TIMEOUT_MS = 1_500;

/** `p`, or `fallback` once `ms` have passed (the late answer is dropped). */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      () => (clearTimeout(t), resolve(fallback)),
    );
  });
}

/**
 * A disk call: never waits past the timeout (and then the disk is dead for the session), never throws (idb-keyval throws
 * synchronously when indexedDB.open does), answers `fallback` at once when the disk is already dead.
 */
export async function onDisk<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  if (diskDead) return fallback;
  let timedOut = false;
  try {
    const p = op();
    return await new Promise<T>((resolve) => {
      const t = setTimeout(() => ((timedOut = true), (diskDead = true), resolve(fallback)), DISK_READ_TIMEOUT_MS);
      p.then(
        (v) => (clearTimeout(t), resolve(timedOut ? fallback : v)),
        () => (clearTimeout(t), resolve(fallback)),
      );
    });
  } catch {
    return fallback;
  }
}

/** A read refreshes an entry's last use at most once an hour (no write per read). */
const TOUCH_EVERY = 60 * 60_000;
let quotaWarned = false;

export function createIdbStorage(): AsyncStorage<PersistedQuery> | undefined {
  const s = getStore();
  const m = getMetaStore();
  if (!s || !m) return undefined;
  // Every operation tolerates failure (quota, blocked storage): the cache must never break reading.
  return {
    getItem: async (key) => {
      if (diskDead) return null;
      try {
        const value = (await onDisk(() => get<PersistedQuery>(key, s), undefined)) ?? null;
        if (value) {
          void get<DiskEntryMeta>(key, m)
            .then((meta) => (meta && Date.now() - meta.at > TOUCH_EVERY ? set(key, { ...meta, at: Date.now() }, m) : undefined))
            .catch(() => undefined);
        }
        return value;
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      if (diskDead) return;
      try {
        await set(key, value, s);
        await set(key, { size: sizeOf(value), at: Date.now(), updated: value.state.dataUpdatedAt } satisfies DiskEntryMeta, m);
      } catch (e) {
        // Full: say so once, and make room for the next writes (the cache keeps working from memory meanwhile)
        if (!quotaWarned) {
          quotaWarned = true;
          console.warn("[cache] a disk write failed; sweeping the disk cache", e);
        }
        void sweepOnce({ budgetBytes: DEFAULT_BUDGET_BYTES / 2 });
      }
    },
    removeItem: async (key) => {
      try {
        await del(key, s);
        await del(key, m);
      } catch {
        /* ignore */
      }
    },
    entries: async () => {
      try {
        return await entries<string, PersistedQuery>(s);
      } catch {
        return [];
      }
    },
  };
}

/** How much the library cache may keep on disk. */
export const DEFAULT_BUDGET_BYTES = 150 * 1024 * 1024;

export interface SweepResult {
  removed: number;
  keptBytes: number;
}

/**
 * Expire, evict and clean up, reading only the metadata index (and the list of keys): entries past their class's lifetime go; entries
 * the index does not know (written before it, or orphaned) go; then the least recently used go until the rest fits the budget.
 * `maxAgeFor(key)` is the lifetime for a key (by its class prefix); 0 means "never keep".
 */
export async function sweepDisk(opts: { budgetBytes?: number; now?: number; maxAgeFor?: (key: string) => number | undefined } = {}): Promise<SweepResult> {
  const s = getStore();
  const m = getMetaStore();
  if (!s || !m) return { removed: 0, keptBytes: 0 };
  const now = opts.now ?? Date.now();
  const budget = opts.budgetBytes ?? DEFAULT_BUDGET_BYTES;
  let removed = 0;
  const drop = async (key: string) => {
    await del(key, s).catch(() => undefined);
    await del(key, m).catch(() => undefined);
    removed++;
  };

  // Anything the index does not know goes: entries written before the index existed (possibly hundreds of MB of link arrays),
  // and orphans. Entries written in this visit are indexed, so they stay.
  const metas = new Map(await entries<string, DiskEntryMeta>(m).catch(() => [] as [string, DiskEntryMeta][]));
  for (const key of (await keys<string>(s).catch(() => [] as string[])).filter((k) => !metas.has(k))) await drop(key);

  const live: [string, DiskEntryMeta][] = [];
  for (const [key, meta] of metas) {
    const maxAge = opts.maxAgeFor?.(key);
    if (maxAge !== undefined && (maxAge === 0 || now - meta.at > maxAge)) await drop(key);
    else live.push([key, meta]);
  }
  let total = live.reduce((n, [, meta]) => n + meta.size, 0);
  for (const [key, meta] of live.sort((a, b) => a[1].at - b[1].at)) {
    if (total <= budget) break;
    await drop(key);
    total -= meta.size;
  }
  return { removed, keptBytes: total };
}

/**
 * Delete every disk entry whose key passes `pred` (an edit made the stored copies wrong: invalidate.ts). Reads only the key list.
 * Returns how many went; never throws (no IndexedDB, or a failing one, deletes nothing).
 */
export async function removeDiskKeysWhere(pred: (key: string) => boolean): Promise<number> {
  const s = getStore();
  const m = getMetaStore();
  if (!s || !m) return 0;
  let n = 0;
  for (const key of await onDisk(() => keys<string>(s), [] as string[])) {
    if (typeof key !== "string" || !pred(key)) continue;
    await onDisk(() => del(key, s), undefined);
    await onDisk(() => del(key, m), undefined);
    n++;
  }
  return n;
}

/** When the disk's copy of `key` was fetched (from the metadata index), or undefined when there is none. */
export async function storedDataUpdatedAt(key: string): Promise<number | undefined> {
  const m = getMetaStore();
  if (!m) return undefined;
  try {
    return (await onDisk(() => get<DiskEntryMeta>(key, m), undefined))?.updated;
  } catch {
    return undefined; // idb-keyval throws synchronously when indexedDB.open does
  }
}

let sweeping: Promise<SweepResult> | undefined;
/** One sweep at a time: a burst of failed writes (at the quota) shares the sweep already running. */
export function sweepOnce(opts?: Parameters<typeof sweepDisk>[0]): Promise<SweepResult> {
  sweeping ??= sweepDisk(opts).catch(() => ({ removed: 0, keptBytes: 0 })).finally(() => (sweeping = undefined));
  return sweeping;
}

/** Test helper: forget the store handles (e.g. after replacing the global IndexedDB factory). */
export function resetIdbStore(): void {
  diskDead = false;
  store = undefined;
  metaStore = undefined;
  quotaWarned = false;
}
