import type { QueryKey } from "@tanstack/react-query";
import { getPersister } from "./persisters";
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
    staleTime: policy.staleTime,
    gcTime: policy.gcTime,
    ...(persister ? { persister: persister.persisterFn } : {}),
    meta: { dataClass },
  };
}
