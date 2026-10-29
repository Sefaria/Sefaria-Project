import type { QueryKey } from "@tanstack/react-query";
import { getPersister, hasApiWarnings } from "./persisters";
import { POLICIES, type DataClass } from "./policies";

/**
 * Applies a data class's cache policy and persister to query options. Every query in the app goes
 * through this so caching behaviour is defined in one place.
 */
export function withPolicy<T extends { queryKey: QueryKey }>(dataClass: DataClass, options: T) {
  const policy = POLICIES[dataClass];
  const persister = getPersister(dataClass);
  return {
    ...options,
    // an answer the API flagged (`warnings`: e.g. a translation the URL named does not exist, and the default came instead) is used
    // once and asked for again next time, never kept as fresh for days (CODE_REVIEW low; persisters.ts keeps it off the disk)
    staleTime: (query: { state: { data?: unknown } }) => (hasApiWarnings(query.state.data) ? 0 : policy.staleTime),
    gcTime: policy.gcTime,
    ...(persister ? { persister: persister.persisterFn } : {}),
    meta: { dataClass },
  };
}
