/**
 * The ref index: what the client has learned about books and ref spellings.
 *  - book meta (depth, address types, section names) → lets the planner resolve refs offline
 *  - aliases (any ref string the user typed or linked → canonical ref) → "Gen.1.1", "בראשית א" etc.
 *    are resolved once by the API and never again
 *
 * Memory map in front of IndexedDB. Without IndexedDB (server render) it is memory-only.
 */
import { createStore, get, set, type UseStore } from "idb-keyval";
import { LRUCache } from "lru-cache";
import type { BookMeta } from "~/lib/text/plan";
import { CACHE_BUSTER } from "./policies";

const DB = "sefaria-reader-refs";
const DAY = 86_400_000;
/**
 * How long what was learned stays trusted (CODE_REVIEW R-19: nothing ever expired, so a book whose structure changed, or a ref
 * whose first available section moved, was planned wrongly forever). Memory is bounded too: on the server this index is shared by
 * every request, and each distinct spelling a crawler asks for used to stay for the life of the process.
 */
export const META_MAX_AGE = 7 * DAY;
export const ALIAS_MAX_AGE = 30 * DAY;
const MAX_METAS = 5_000;
const MAX_ALIASES = 20_000;

/** What is kept on disk: the value with when it was learned and under which cache buster. */
interface Stamped<T> {
  v: T;
  at: number;
  b: string;
}
const fresh = <T>(s: Stamped<T> | T | undefined, maxAge: number, now: number): T | undefined => {
  if (!s || typeof s !== "object" || !("at" in s) || !("b" in s)) return undefined; // written before stamping: learn it again
  return s.b === CACHE_BUSTER && now - s.at <= maxAge ? s.v : undefined;
};

export class RefIndex {
  private metas = new LRUCache<string, BookMeta>({ max: MAX_METAS, ttl: META_MAX_AGE });
  private aliases = new LRUCache<string, string>({ max: MAX_ALIASES, ttl: ALIAS_MAX_AGE });
  private metaStore: UseStore | undefined;
  private aliasStore: UseStore | undefined;

  constructor(useDisk = typeof indexedDB !== "undefined", private now: () => number = Date.now) {
    if (useDisk) {
      this.metaStore = createStore(`${DB}-meta`, "meta");
      this.aliasStore = createStore(`${DB}-alias`, "alias");
    }
  }

  async getMeta(book: string): Promise<BookMeta | undefined> {
    const hit = this.metas.get(book);
    if (hit || !this.metaStore) return hit;
    try {
      const disk = fresh(await get<Stamped<BookMeta>>(book, this.metaStore), META_MAX_AGE, this.now());
      if (disk) this.metas.set(book, disk);
      return disk;
    } catch {
      return undefined;
    }
  }

  async setMeta(meta: BookMeta): Promise<void> {
    this.metas.set(meta.book, meta);
    if (this.metaStore) await set(meta.book, { v: meta, at: this.now(), b: CACHE_BUSTER } satisfies Stamped<BookMeta>, this.metaStore).catch(() => {});
  }

  async resolveAlias(ref: string): Promise<string | undefined> {
    const hit = this.aliases.get(ref);
    if (hit || !this.aliasStore) return hit;
    try {
      const disk = fresh(await get<Stamped<string>>(ref, this.aliasStore), ALIAS_MAX_AGE, this.now());
      if (disk) this.aliases.set(ref, disk);
      return disk;
    } catch {
      return undefined;
    }
  }

  async setAlias(from: string, to: string): Promise<void> {
    if (from === to) return;
    this.aliases.set(from, to);
    if (this.aliasStore) await set(from, { v: to, at: this.now(), b: CACHE_BUSTER } satisfies Stamped<string>, this.aliasStore).catch(() => {});
  }

  /** Forget the in-memory layer (simulates a page reload in tests). */
  dropMemory(): void {
    this.metas.clear();
    this.aliases.clear();
  }
}
