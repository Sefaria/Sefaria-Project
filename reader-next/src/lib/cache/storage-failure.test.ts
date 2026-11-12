/**
 * The reader must work whatever IndexedDB does: missing (some private modes, the server), throwing on open (blocked storage),
 * hanging (WebKit's open that never answers), failing mid-session (quota), or emptied (iOS Safari evicts script-written storage after
 * 7 days without a visit). Each case reads a text through the real cache layer (policy, persister, storage) and the ref index.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStore, keys } from "idb-keyval";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import { resetIdbStore } from "./storage";
import { resetPersisters } from "./persisters";
import { RefIndex } from "./ref-index";
import { withPolicy } from "./query-options";
import { forgetOnDisk } from "./invalidate";

const realIdb = globalThis.indexedDB;
/** The persister writes a moment after the fetch: wait until the entry is on disk. */
async function written() {
  for (let i = 0; i < 100; i++) {
    if ((await keys(createStore("sefaria-reader", "queries")).catch(() => [])).length) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("nothing was written");
}
const install = (factory: unknown) => {
  if (factory === undefined) delete (globalThis as { indexedDB?: unknown }).indexedDB;
  else globalThis.indexedDB = factory as IDBFactory;
  resetPersisters();
  resetIdbStore();
};

/** Read "Genesis 1" through the text class's policy and persister, the way the reader's queries do. */
async function readText(qc = new QueryClient(), fetched = vi.fn(async () => ({ ref: "Genesis 1", text: ["In the beginning"] }))) {
  const options = queryOptions<{ ref: string; text: string[] }>({ ...withPolicy("text", { queryKey: ["text", "Genesis 1", "~"] as const, queryFn: fetched }) });
  const data = await qc.fetchQuery(options);
  return { data, fetched, qc };
}

/** A factory whose `open` never answers. */
const hanging = { open: () => ({}) as IDBOpenDBRequest } as unknown as IDBFactory;
/** A factory whose `open` throws (Firefox private mode used to; storage blocked by the user). */
const throwing = {
  open: () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
} as unknown as IDBFactory;

beforeEach(() => install(new IDBFactory()));
afterEach(() => {
  vi.restoreAllMocks(); // a Date.now mock must not leak into the next test
  install(realIdb);
});

describe("reading works whatever IndexedDB does", () => {
  it("missing: memory only", async () => {
    install(undefined);
    const { data, fetched } = await readText();
    expect(data.ref).toBe("Genesis 1");
    expect(fetched).toHaveBeenCalledTimes(1);
    const idx = new RefIndex();
    await idx.setMeta({ book: "Genesis", textDepth: 2 } as never);
    expect((await idx.getMeta("Genesis"))?.textDepth).toBe(2);
  });

  it("throws on open: the text still loads, the ref index still learns, invalidation is a no-op", async () => {
    install(throwing);
    const { data } = await readText();
    expect(data.ref).toBe("Genesis 1");
    const idx = new RefIndex(true);
    await expect(idx.setMeta({ book: "Genesis", textDepth: 2 } as never)).resolves.toBeUndefined();
    expect((await idx.getMeta("Genesis"))?.textDepth).toBe(2); // from memory
    idx.dropMemory();
    await expect(idx.getMeta("Genesis")).resolves.toBeUndefined();
    await expect(idx.resolveAlias("Gen. 1")).resolves.toBeUndefined();
    await expect(forgetOnDisk({ kind: "links" })).resolves.toBe(0);
  });

  it("hangs: the first read gives up after the timeout, and the disk is skipped for the rest of the visit", async () => {
    install(hanging);
    const t0 = Date.now();
    const first = await readText();
    const second = await readText(new QueryClient()); // a second page's read: the disk is not waited for again
    expect(first.data.ref).toBe("Genesis 1");
    expect(second.data.ref).toBe("Genesis 1");
    expect(Date.now() - t0).toBeLessThan(2_000);
    const idx = new RefIndex(true);
    const t1 = Date.now();
    await expect(idx.resolveAlias("Gen. 1")).resolves.toBeUndefined();
    expect(Date.now() - t1).toBeLessThan(100);
  }, 10_000);

  it("fails mid-session (quota): reads keep working from memory and the network", async () => {
    const factory = new IDBFactory();
    install(factory);
    const first = await readText();
    await written();
    // from now on every transaction fails, as at the quota
    const open = factory.open.bind(factory);
    factory.open = ((...args: Parameters<IDBFactory["open"]>) => {
      const req = open(...args);
      req.addEventListener("success", () => {
        const db = req.result;
        db.transaction = () => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        };
      });
      return req;
    }) as IDBFactory["open"];
    resetIdbStore();
    resetPersisters();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const again = await readText(new QueryClient());
    expect(again.data.ref).toBe("Genesis 1");
    expect(again.fetched).toHaveBeenCalledTimes(1); // the disk could not answer: the network did
    expect(first.data.ref).toBe("Genesis 1");
    warn.mockRestore();
  });

  it("emptied between visits (iOS eviction): the next visit fetches, and stores again", async () => {
    const factory = new IDBFactory();
    install(factory);
    await readText();
    await written();
    // a new visit with the stored copy: no fetch
    resetPersisters();
    const warm = await readText(new QueryClient());
    expect(warm.fetched).not.toHaveBeenCalled();
    // the browser evicted everything
    install(new IDBFactory());
    const cold = await readText(new QueryClient());
    expect(cold.fetched).toHaveBeenCalledTimes(1);
  });
});

// D-7: TanStack refetches a restored query only for an observer that finds it stale; loaders read through fetchQuery (no observer), so a
// stored copy was used as is for as long as the disk kept it
describe("a copy restored from disk past the hour", () => {
  it("is used at once and asked for again behind it; within the hour it is not", async () => {
    const factory = new IDBFactory();
    install(factory);
    await readText();
    await written();
    resetPersisters();
    const fresh = await readText(new QueryClient());
    await new Promise((r) => setTimeout(r, 50));
    expect(fresh.fetched).not.toHaveBeenCalled();

    resetPersisters();
    const later = Date.now() + 61 * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const stale = await readText(new QueryClient());
    expect(stale.data.ref).toBe("Genesis 1"); // the stored copy, at once
    await vi.waitFor(() => expect(stale.fetched).toHaveBeenCalledTimes(1));
  });
});
