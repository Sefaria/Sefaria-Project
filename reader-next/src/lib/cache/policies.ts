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
  // Text and catalog are revalidated at most an hour after they were fetched (docs/DECISIONS.md, D-7). The disk keeps them for 30 days,
  // so a page still paints from disk at once; past the hour the stored copy shows and a fetch (through Varnish) refreshes it behind.
  catalog: { staleTime: HOUR, gcTime: 6 * HOUR, maxAge: 30 * DAY },
  text: { staleTime: HOUR, gcTime: 6 * HOUR, maxAge: 30 * DAY },
  // memory only: a chapter's link rows are megabytes (Genesis 1: 6.3 MB), cheap to refetch through Varnish and
  // never worth a disk write; counts per segment will come from the server instead
  connections: { staleTime: HOUR, gcTime: 30 * MINUTE, maxAge: 0 },
  reference: { staleTime: 30 * DAY, gcTime: 6 * HOUR, maxAge: 90 * DAY },
  search: { staleTime: 5 * MINUTE, gcTime: 30 * MINUTE, maxAge: 0 },
  user: { staleTime: 0, gcTime: 5 * MINUTE, maxAge: 0 },
};

/**
 * Bump when a cached data shape changes. Disk entries written under a different buster are discarded.
 */
export const CACHE_BUSTER = "2026-10-29.2"; // R-18 and its follow-up: spanning ranges (commentary ones too) were cached with wrong segment refs

/**
 * Staff and moderators edit texts and indexes and check the result: for them text and catalog are never fresh (D-7: "staff always revalidate"). Known in the
 * browser once the viewer query answers (query-client.ts watches it); a page holds one reader, so this is module state.
 */
let staffFreshness = false;
export function setStaffFreshness(staff: boolean): void {
  staffFreshness = staff;
}

/** The fresh window for a class, for the reader in this page. */
export function staleTimeFor(dataClass: DataClass): number {
  if (staffFreshness && (dataClass === "text" || dataClass === "catalog")) return 0; // D-7: staff always revalidate (never block: loaders show the cache)
  return POLICIES[dataClass].staleTime;
}
