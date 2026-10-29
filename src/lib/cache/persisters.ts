/**
 * One fine-grained persister per data class, so each class keeps its own on-disk lifetime.
 */
import { experimental_createQueryPersister, type PersistedQuery } from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";
import { CACHE_BUSTER, POLICIES, type DataClass } from "./policies";
import { createIdbStorage, resetIdbStore, storedDataUpdatedAt, sweepOnce, type SweepResult } from "./storage";

type QueryPersister = ReturnType<typeof experimental_createQueryPersister<PersistedQuery>>;

const persisters = new Map<DataClass, QueryPersister>();

export function getPersister(dataClass: DataClass): QueryPersister | undefined {
  if (POLICIES[dataClass].maxAge === 0) return undefined;
  let p = persisters.get(dataClass);
  if (!p) {
    const storage = createIdbStorage();
    if (!storage) return undefined;
    p = experimental_createQueryPersister<PersistedQuery>({
      // an answer with API warnings is never written to disk (see withPolicy)
      storage: { ...storage, setItem: (key, value) => (hasApiWarnings(value.state.data) ? storage.removeItem(key) : storage.setItem(key, value)) },
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

/** True for an API answer that carries `warnings` (the v3 texts API: a requested version it does not have, …). */
export const hasApiWarnings = (data: unknown): boolean => {
  const w = (data as { warnings?: unknown } | null | undefined)?.warnings;
  return Array.isArray(w) && w.length > 0;
};

/** A disk key's lifetime, from its class prefix (`sr-text-…`); undefined for a key of no known class. */
export function maxAgeForKey(key: string): number | undefined {
  const m = /^sr-([a-z]+)-/.exec(key);
  return m && m[1]! in POLICIES ? POLICIES[m[1] as DataClass].maxAge : undefined;
}

/**
 * Bound the disk cache: expire by class lifetime, drop what is not tracked, evict the least recently used past the budget (storage.ts).
 * Reads only metadata, so it is cheap; run at idle after the page settles (src/routes/__root.tsx).
 */
export async function collectGarbage(budgetBytes?: number): Promise<SweepResult> {
  return sweepOnce({ maxAgeFor: maxAgeForKey, budgetBytes });
}

/** Test helper: forget persister instances (storage contents are untouched). */
export function resetPersisters(): void {
  persisters.clear();
  resetIdbStore();
}

/**
 * Write to disk what the server rendered (CODE_REVIEW R-20): the persister writes a query when its queryFn runs, and queries seeded
 * by the server render never run theirs — so the very page a reader landed on was the one page not kept for next time. Run once
 * after hydration; only classes that are persisted, only successful data.
 */
export async function persistHydrated(queryClient: QueryClient): Promise<number> {
  let n = 0;
  for (const query of queryClient.getQueryCache().getAll()) {
    const dataClass = (query.meta as { dataClass?: DataClass } | undefined)?.dataClass;
    if (!dataClass || query.state.status !== "success" || query.state.data === undefined) continue;
    const persister = getPersister(dataClass);
    if (!persister) continue;
    // already on disk, as new (fetched on this page and written then, or restored from disk): no second write (CODE_REVIEW low)
    const onDisk = await storedDataUpdatedAt(`sr-${dataClass}-${query.queryHash}`);
    if (onDisk !== undefined && onDisk >= query.state.dataUpdatedAt) continue;
    await persister.persistQuery(query).catch(() => undefined);
    n++;
  }
  return n;
}
