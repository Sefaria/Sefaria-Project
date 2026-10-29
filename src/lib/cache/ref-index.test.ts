import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStore, set } from "idb-keyval";
import { ALIAS_MAX_AGE, META_MAX_AGE, RefIndex } from "./ref-index";

const meta = { book: "Genesis", depth: 2, addressTypes: ["Perek", "Pasuk"], sectionNames: ["Chapter", "Verse"] } as never;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

// CODE_REVIEW R-19: what the client learned about books and spellings never expired
describe("RefIndex lifetimes", () => {
  it("what was learned comes back from disk after a reload, while fresh", async () => {
    let now = 1_000_000;
    const idx = new RefIndex(true, () => now);
    await idx.setMeta(meta);
    await idx.setAlias("Gen. 1", "Genesis 1");
    idx.dropMemory();
    now += META_MAX_AGE - 1;
    expect(await idx.getMeta("Genesis")).toEqual(meta);
    expect(await idx.resolveAlias("Gen. 1")).toBe("Genesis 1");
  });

  it("is learned again once too old", async () => {
    let now = 1_000_000;
    const idx = new RefIndex(true, () => now);
    await idx.setMeta(meta);
    await idx.setAlias("Gen. 1", "Genesis 1");
    idx.dropMemory();
    now += ALIAS_MAX_AGE + 1;
    expect(await idx.getMeta("Genesis")).toBeUndefined();
    expect(await idx.resolveAlias("Gen. 1")).toBeUndefined();
  });

  it("an entry written before stamping (or under another cache buster) is not trusted", async () => {
    await set("Genesis", meta, createStore("sefaria-reader-refs-meta", "meta"));
    await set("Gen. 1", { v: "Genesis 1", at: Date.now(), b: "an-old-buster" }, createStore("sefaria-reader-refs-alias", "alias"));
    const idx = new RefIndex(true);
    expect(await idx.getMeta("Genesis")).toBeUndefined();
    expect(await idx.resolveAlias("Gen. 1")).toBeUndefined();
  });
});
