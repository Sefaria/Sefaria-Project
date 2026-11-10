import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStore, keys } from "idb-keyval";
import { hashKey, QueryClient } from "@tanstack/react-query";
import { createIdbStorage, resetIdbStore } from "~/lib/cache/storage";
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
  it("a version save invalidates the book's versions, texts and page in memory, not another book's", async () => {
    const qc = new QueryClient();
    for (const k of [["versions", "Genesis"], ["text", "Genesis 1", "~"], ["catalog", "index-details", "Genesis"], ["versions", "Exodus"]]) qc.setQueryData(k, 1);
    await afterVersionWrite(qc, "Genesis");
    const invalid = qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => q.queryKey);
    expect(invalid).toEqual(expect.arrayContaining([["versions", "Genesis"], ["text", "Genesis 1", "~"], ["catalog", "index-details", "Genesis"]]));
    expect(invalid).not.toContainEqual(["versions", "Exodus"]);
  });

  it("leaving for Django (Add Section, /admin/reset, after a delete) deletes the book's stored copies before the page is left", async () => {
    const assign = vi.fn(async () => expect(await stored()).toEqual(["Exodus 1"]));
    await leaveAfterWrite(new QueryClient(), [{ kind: "book", title: "Genesis" }], "/add/Genesis", assign);
    expect(assign).toHaveBeenCalledWith("/add/Genesis");
    expect(await stored()).toEqual(["Exodus 1"]);
  });

  it("a rename forgets the book under both titles and the catalog", () => {
    expect(indexWrites("Genesis", "Genesis")).toEqual([{ kind: "book", title: "Genesis" }]);
    expect(indexWrites("Genesis", "Bereshit")).toEqual([{ kind: "book", title: "Genesis" }, { kind: "book", title: "Bereshit" }, { kind: "catalog" }]);
  });
});
