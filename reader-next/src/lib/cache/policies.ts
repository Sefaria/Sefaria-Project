/**
 * Cache policies per data class. See docs/ARCHITECTURE.md › Library cache.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type DataClass = "catalog" | "text" | "connections" | "reference" | "search" | "user";

export interface CachePolicy {
  /** How long data counts as fresh (no background refetch). */
  staleTime: number;
  /** How long unused data stays in memory. */
  gcTime: number;
  /** How long data is kept on disk; `0` means not persisted. */
  maxAge: number;
}

export const POLICIES: Record<DataClass, CachePolicy> = {
  catalog: { staleTime: DAY, gcTime: 6 * HOUR, maxAge: 30 * DAY },
  text: { staleTime: 7 * DAY, gcTime: 6 * HOUR, maxAge: 30 * DAY },
  // memory only (CODE_REVIEW R-10): a chapter's link rows are megabytes (Genesis 1: 6.3 MB), cheap to refetch through Varnish and
  // never worth a disk write; counts per segment will come from the server instead (TARGET_ARCHITECTURE §6.7)
  connections: { staleTime: HOUR, gcTime: 30 * MINUTE, maxAge: 0 },
  reference: { staleTime: 30 * DAY, gcTime: 6 * HOUR, maxAge: 90 * DAY },
  search: { staleTime: 5 * MINUTE, gcTime: 30 * MINUTE, maxAge: 0 },
  user: { staleTime: 0, gcTime: 5 * MINUTE, maxAge: 0 },
};

/**
 * Bump when a cached data shape changes. Disk entries written under a different buster are discarded.
 */
export const CACHE_BUSTER = "2026-10-29.2"; // R-18 and its follow-up: spanning ranges (commentary ones too) were cached with wrong segment refs
