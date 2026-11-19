/**
 * One fine-grained persister per data class, so each class keeps its own on-disk lifetime.
 */
import { experimental_createQueryPersister, type PersistedQuery } from "@tanstack/query-persist-client-core";
import type { QueryClient } from "@tanstack/react-query";
import { CACHE_BUSTER, POLICIES, staleTimeFor, type DataClass } from "./policies";
import { pendingDiskInvalidation } from "./invalidate";
import { sweepRefIndexDisk } from "./ref-index";
import { createIdbStorage, DISK_READ_TIMEOUT_MS, isDiskDead, resetIdbStore, storedDataUpdatedAt, sweepOnce, within, type SweepResult } from "./storage";

type QueryPersister = ReturnType<typeof experimental_createQueryPersister<PersistedQuery>> & {
  /** `persisterFn`, plus a refresh of what it restored from disk once that is past its class's fresh window (see `revalidating`). */
  revalidatingFn: QueryPersister["persisterFn"];
};

const persisters = new Map<DataClass, QueryPersister>();

/**
 * TanStack refetches a restored query only when an observer finds it stale; the reader reads most text through loaders and
 * `fetchQuery` (no observer), so a copy restored from disk was used as it was for as long as the disk kept it (30 days), whatever its
 * staleTime. D-7: past the class's fresh window, the restored copy is used at once and asked for again behind it.
 */
function revalidating(dataClass: DataClass, inner: QueryPersister["persisterFn"], restoredAt: Map<string, number>): QueryPersister["persisterFn"] {
  return (async (queryFn, ctx, query) => {
    let fetched = false;
    const data = await inner(((c: never) => ((fetched = true), queryFn(c))) as typeof queryFn, ctx, query);
    const at = restoredAt.get(query.queryHash);
    restoredAt.delete(query.queryHash);
    if (!fetched && at !== undefined && Date.now() - at > staleTimeFor(dataClass)) {
      // after this fetch settles (the restore's own bookkeeping runs in the same macrotask queue first)
      setTimeout(() => void query.fetch(undefined, { cancelRefetch: false })?.catch(() => undefined), 0);
    }
    return data;
  }) as QueryPersister["persisterFn"];
}

export function getPersister(dataClass: DataClass): QueryPersister | undefined {
  if (POLICIES[dataClass].maxAge === 0) return undefined;
  let p = persisters.get(dataClass);
  if (!p) {
    const storage = createIdbStorage();
    if (!storage) return undefined;
    const prefix = `sr-${dataClass}`;
    const restoredAt = new Map<string, number>();
    const base = experimental_createQueryPersister<PersistedQuery>({
      storage: {
        ...storage,
        // a read waits for deletions an edit started (invalidate.ts), and notes when what it restores was fetched (revalidating)
        getItem: async (key) => {
          if (!isDiskDead()) await within(pendingDiskInvalidation(), DISK_READ_TIMEOUT_MS, undefined);
          const value = await storage.getItem(key);
          if (value && value.buster === CACHE_BUSTER) restoredAt.set(key.slice(prefix.length + 1), value.state.dataUpdatedAt);
          return value;
        },
        // an answer with API warnings is never written to disk (see withPolicy)
        setItem: (key, value) => (hasApiWarnings(value.state.data) ? storage.removeItem(key) : storage.setItem(key, value)),
      },
      buster: CACHE_BUSTER,
      maxAge: POLICIES[dataClass].maxAge,
      prefix,
      serialize: (q) => q,
      deserialize: (q) => q,
    });
    p = { ...base, revalidatingFn: revalidating(dataClass, base.persisterFn, restoredAt) };
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
  const result = await sweepOnce({ maxAgeFor: maxAgeForKey, budgetBytes });
  await sweepRefIndexDisk().catch(() => 0); // the ref index keeps its own stores
  return result;
}

/** Test helper: forget persister instances (storage contents are untouched). */
export function resetPersisters(): void {
  persisters.clear();
  resetIdbStore();
}

/**
 * Write to disk what the server rendered: the persister writes a query when its queryFn runs, and queries seeded
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
    // already on disk, as new (fetched on this page and written then, or restored from disk): no second write
    const onDisk = await storedDataUpdatedAt(`sr-${dataClass}-${query.queryHash}`);
    if (onDisk !== undefined && onDisk >= query.state.dataUpdatedAt) continue;
    await persister.persistQuery(query).catch(() => undefined);
    n++;
  }
  return n;
}
