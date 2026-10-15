/**
 * The ref index: what the client has learned about books and ref spellings.
 *  - book meta (depth, address types, section names) → lets the planner resolve refs offline
 *  - aliases (any ref string the user typed or linked → canonical ref) → "Gen.1.1", "בראשית א" etc.
 *    are resolved once by the API and never again
 *
 * Memory map in front of IndexedDB. Without IndexedDB (server render) it is memory-only.
 */
import { createStore, get, set, type UseStore } from "idb-keyval";
import type { BookMeta } from "~/lib/text/plan";

const DB = "sefaria-reader-refs";

export class RefIndex {
  private metas = new Map<string, BookMeta>();
  private aliases = new Map<string, string>();
  private metaStore: UseStore | undefined;
  private aliasStore: UseStore | undefined;

  constructor(useDisk = typeof indexedDB !== "undefined") {
    if (useDisk) {
      this.metaStore = createStore(`${DB}-meta`, "meta");
      this.aliasStore = createStore(`${DB}-alias`, "alias");
    }
  }

  async getMeta(book: string): Promise<BookMeta | undefined> {
    const hit = this.metas.get(book);
    if (hit || !this.metaStore) return hit;
    try {
      const disk = await get<BookMeta>(book, this.metaStore);
      if (disk) this.metas.set(book, disk);
      return disk;
    } catch {
      return undefined;
    }
  }

  async setMeta(meta: BookMeta): Promise<void> {
    this.metas.set(meta.book, meta);
    if (this.metaStore) await set(meta.book, meta, this.metaStore).catch(() => {});
  }

  async resolveAlias(ref: string): Promise<string | undefined> {
    const hit = this.aliases.get(ref);
    if (hit || !this.aliasStore) return hit;
    try {
      const disk = await get<string>(ref, this.aliasStore);
      if (disk) this.aliases.set(ref, disk);
      return disk;
    } catch {
      return undefined;
    }
  }

  async setAlias(from: string, to: string): Promise<void> {
    if (from === to) return;
    this.aliases.set(from, to);
    if (this.aliasStore) await set(from, to, this.aliasStore).catch(() => {});
  }

  /** Forget the in-memory layer (simulates a page reload in tests). */
  dropMemory(): void {
    this.metas.clear();
    this.aliases.clear();
  }
}
