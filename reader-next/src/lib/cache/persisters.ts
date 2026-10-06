/**
 * One fine-grained persister per data class, so each class keeps its own on-disk lifetime.
 */
import { experimental_createQueryPersister, type PersistedQuery } from "@tanstack/query-persist-client-core";
import { CACHE_BUSTER, POLICIES, type DataClass } from "./policies";
import { createIdbStorage, resetIdbStore } from "./storage";

type QueryPersister = ReturnType<typeof experimental_createQueryPersister<PersistedQuery>>;

const persisters = new Map<DataClass, QueryPersister>();

export function getPersister(dataClass: DataClass): QueryPersister | undefined {
  if (POLICIES[dataClass].maxAge === 0) return undefined;
  let p = persisters.get(dataClass);
  if (!p) {
    const storage = createIdbStorage();
    if (!storage) return undefined;
    p = experimental_createQueryPersister<PersistedQuery>({
      storage,
      buster: CACHE_BUSTER,
      maxAge: POLICIES[dataClass].maxAge,
      prefix: `sr-${dataClass}`,
      serialize: (q) => q,
      deserialize: (q) => q,
    });
    persisters.set(dataClass, p);
  }
  return p;
}

/** Remove expired or busted entries from disk for every class. Safe to call at idle time. */
export async function collectGarbage(): Promise<void> {
  await Promise.all([...persisters.values()].map((p) => p.persisterGc()));
}

/** Test helper: forget persister instances (storage contents are untouched). */
export function resetPersisters(): void {
  persisters.clear();
  resetIdbStore();
}
