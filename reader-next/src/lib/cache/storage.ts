/**
 * IndexedDB storage for persisted queries. Values are stored as structured clones (no JSON round trip).
 * Returns `undefined` where IndexedDB is unavailable (server render, some private modes) so the cache
 * degrades to memory-only.
 */
import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import type { AsyncStorage, PersistedQuery } from "@tanstack/query-persist-client-core";

export const DB_NAME = "sefaria-reader";
export const STORE_NAME = "queries";

let store: UseStore | undefined;

function getStore(): UseStore | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  store ??= createStore(DB_NAME, STORE_NAME);
  return store;
}

export function createIdbStorage(): AsyncStorage<PersistedQuery> | undefined {
  const s = getStore();
  if (!s) return undefined;
  // Every operation tolerates failure (quota, blocked storage): the cache must never break reading.
  return {
    getItem: async (key) => {
      try {
        return (await get<PersistedQuery>(key, s)) ?? null;
      } catch {
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        await set(key, value, s);
      } catch {
        /* ignore quota and blocked-storage errors */
      }
    },
    removeItem: async (key) => {
      try {
        await del(key, s);
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

/** Test helper: forget the store handle (e.g. after replacing the global IndexedDB factory). */
export function resetIdbStore(): void {
  store = undefined;
}
