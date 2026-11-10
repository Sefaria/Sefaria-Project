import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStore, keys } from "idb-keyval";
import { hashKey, QueryClient, QueryObserver } from "@tanstack/react-query";
import { createIdbStorage, resetIdbStore } from "~/lib/cache/storage";
import { EDITOR_LEAVE_WAIT_MS } from "~/lib/cache/invalidate";
import { afterVersionWrite, indexWrites, leaveAfterWrite } from "./book-writes";

const entry = (key: unknown[]) => ({ buster: "x", queryHash: hashKey(key), queryKey: key, state: { data: 1, dataUpdatedAt: 1, status: "success" } }) as never;
const stored = async () => (await keys<string>(createStore("sefaria-reader", "queries"))).map((k) => JSON.parse(k.replace(/^sr-[a-z]+-/, ""))[1] as string);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetIdbStore();
  const s = createIdbStorage()!;
  for (const k of [["text", "Genesis 1", "~"], ["text", "Exodus 1", "~"]]) await s.setItem(`sr-text-${hashKey(k)}`, entry(k));
});

// carry-over R2 (wave 2): the book page's moderator writes forget the book, in memory and on disk
describe("the book page's writes", () => {
  it("a version save marks the book stale (not another book) and refetches only the versions list, even when the catalog never answers", async () => {
    const qc = new QueryClient();
    let versionsAsked = 0;
    for (const k of [["text", "Genesis 1", "~"], ["catalog", "index-details", "Genesis"], ["versions", "Exodus"]]) qc.setQueryData(k, 1);
    qc.setQueryData(["versions", "Genesis"], 1);
    // the page's active queries: the whole catalog (a request that never resolves) and the versions list
    const toc = new QueryObserver(qc, { queryKey: ["catalog", "toc"], queryFn: () => new Promise(() => {}), staleTime: Infinity, initialData: [] });
    const versions = new QueryObserver(qc, { queryKey: ["versions", "Genesis"], queryFn: async () => (versionsAsked++, 2), staleTime: Infinity });
    const offs = [toc.subscribe(() => {}), versions.subscribe(() => {})];
    await afterVersionWrite(qc, "Genesis");
    expect(versionsAsked).toBe(1);
    const stale = qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey);
    expect(stale).toEqual(expect.arrayContaining([["text", "Genesis 1", "~"], ["catalog", "index-details", "Genesis"], ["catalog", "toc"]]));
    expect(stale).not.toContainEqual(["versions", "Exodus"]);
    expect(qc.getQueryState(["catalog", "toc"])?.fetchStatus).toBe("idle"); // not refetched
    offs.forEach((off) => off());
  });

  it("leaving for Django (Add Section, /admin/reset, after a delete) deletes the book's stored copies before the page is left", async () => {
    const assign = vi.fn(async () => expect(await stored()).toEqual(["Exodus 1"]));
    await leaveAfterWrite([{ kind: "book", title: "Genesis" }], "/add/Genesis", assign);
    expect(assign).toHaveBeenCalledWith("/add/Genesis");
    expect(await stored()).toEqual(["Exodus 1"]);
  });

  it("a disk that never answers holds the reader at most EDITOR_LEAVE_WAIT_MS", async () => {
    globalThis.indexedDB = { open: () => ({}) } as unknown as IDBFactory; // a request whose events never fire
    resetIdbStore();
    const assign = vi.fn();
    const t0 = Date.now();
    await leaveAfterWrite([{ kind: "book", title: "Genesis" }, { kind: "catalog" }], "/texts", assign);
    expect(assign).toHaveBeenCalledWith("/texts");
    expect(Date.now() - t0).toBeLessThan(EDITOR_LEAVE_WAIT_MS + 200);
  });

  it("a rename forgets the book under both titles and the catalog", () => {
    expect(indexWrites("Genesis", "Genesis")).toEqual([{ kind: "book", title: "Genesis" }]);
    expect(indexWrites("Genesis", "Bereshit")).toEqual([{ kind: "book", title: "Genesis" }, { kind: "book", title: "Bereshit" }, { kind: "catalog" }]);
  });
});
