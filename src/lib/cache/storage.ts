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
}

let store: UseStore | undefined;
let metaStore: UseStore | undefined;

function getStore(): UseStore | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  store ??= createStore(DB_NAME, STORE_NAME);
  return store;
}
function getMetaStore(): UseStore | undefined {
  if (typeof indexedDB === "undefined") return undefined;
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
      try {
        const value = (await get<PersistedQuery>(key, s)) ?? null;
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
      try {
        await set(key, value, s);
        await set(key, { size: sizeOf(value), at: Date.now() } satisfies DiskEntryMeta, m);
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

let sweeping: Promise<SweepResult> | undefined;
/** One sweep at a time: a burst of failed writes (at the quota) shares the sweep already running. */
export function sweepOnce(opts?: Parameters<typeof sweepDisk>[0]): Promise<SweepResult> {
  sweeping ??= sweepDisk(opts).catch(() => ({ removed: 0, keptBytes: 0 })).finally(() => (sweeping = undefined));
  return sweeping;
}

/** Test helper: forget the store handles (e.g. after replacing the global IndexedDB factory). */
export function resetIdbStore(): void {
  store = undefined;
  metaStore = undefined;
  quotaWarned = false;
}
