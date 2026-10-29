import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStore, get, keys, set } from "idb-keyval";
import { createIdbStorage, resetIdbStore, sweepDisk } from "./storage";
import { maxAgeForKey } from "./persisters";

const DAY = 86_400_000;
const entry = (n: number) => ({ buster: "x", queryHash: "h", queryKey: ["k"], state: { data: "x".repeat(n), dataUpdatedAt: 0, status: "success" } }) as never;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetIdbStore();
});

// CODE_REVIEW R-11: the disk cache was never swept; it grew until the quota silently stopped every write
describe("the disk cache is bounded", () => {
  it("a sweep clears what was written before the index existed, and keeps what this visit wrote", async () => {
    const legacy = createStore("sefaria-reader", "queries");
    await set("sr-connections-old", "x".repeat(1000), legacy);
    await createIdbStorage()!.setItem("sr-text-new", entry(10));
    const r = await sweepDisk();
    expect(r.removed).toBe(1);
    expect(await keys(legacy)).toEqual(["sr-text-new"]);
  });

  it("expires by class lifetime, drops a class that is no longer kept, and keeps the rest", async () => {
    await sweepDisk(); // the index exists from here on
    const s = createIdbStorage()!;
    const now = Date.now();
    await s.setItem("sr-text-fresh", entry(10));
    await s.setItem("sr-text-old", entry(10));
    await s.setItem("sr-connections-links", entry(10));
    const meta = createStore("sefaria-reader-meta", "meta");
    await set("sr-text-old", { size: 10, at: now - 40 * DAY }, meta); // older than text's 30 days
    await sweepDisk({ maxAgeFor: maxAgeForKey, now });
    expect((await keys(createStore("sefaria-reader", "queries"))).sort()).toEqual(["sr-text-fresh"]);
  });

  it("past the budget, the least recently used go first", async () => {
    await sweepDisk();
    const s = createIdbStorage()!;
    await s.setItem("sr-text-a", entry(400));
    await s.setItem("sr-text-b", entry(400));
    await s.setItem("sr-text-c", entry(400));
    const meta = createStore("sefaria-reader-meta", "meta");
    const now = Date.now();
    for (const [k, age] of [["sr-text-a", 3], ["sr-text-b", 1], ["sr-text-c", 2]] as const) await set(k, { ...(await get(k, meta))!, at: now - age * 1000 }, meta);
    const r = await sweepDisk({ budgetBytes: 1000, now, maxAgeFor: maxAgeForKey });
    expect((await keys(createStore("sefaria-reader", "queries"))).sort()).toEqual(["sr-text-b"]);
    expect(r.keptBytes).toBeLessThanOrEqual(1000);
  });

  it("an entry the index does not know (orphaned) is removed", async () => {
    await sweepDisk();
    await set("sr-text-orphan", "x", createStore("sefaria-reader", "queries"));
    await sweepDisk({ maxAgeFor: maxAgeForKey });
    expect(await keys(createStore("sefaria-reader", "queries"))).toEqual([]);
  });
});

// CODE_REVIEW R-20: queries seeded by the server render never ran their queryFn, so they were never written to disk
describe("persistHydrated", () => {
  it("writes the server-rendered data of persisted classes, and nothing else", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { persistHydrated, resetPersisters } = await import("./persisters");
    resetPersisters();
    await sweepDisk(); // index in place
    const qc = new QueryClient();
    const seed = (key: string[], dataClass: string) => qc.getQueryCache().build(qc, { queryKey: key, meta: { dataClass } }).setData({ ok: key[1] });
    seed(["text", "Genesis 1"], "text");
    seed(["search", "love"], "search");
    expect(await persistHydrated(qc)).toBe(1);
    const stored = await keys(createStore("sefaria-reader", "queries"));
    expect(stored).toHaveLength(1);
    expect(String(stored[0])).toMatch(/^sr-text-/);
  });
});
