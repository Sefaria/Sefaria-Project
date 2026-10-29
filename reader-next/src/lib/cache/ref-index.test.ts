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

// review F12: the ref index's own disk stores were outside the query cache's sweep, so they only grew
describe("sweepRefIndexDisk", () => {
  it("removes expired and busted rows from both stores and keeps the rest", async () => {
    const { sweepRefIndexDisk } = await import("./ref-index");
    const { keys } = await import("idb-keyval");
    const now = 10 * ALIAS_MAX_AGE;
    const idx = new RefIndex(true, () => now);
    await idx.setAlias("Gen.1.1", "Genesis 1:1");
    await idx.setMeta({ book: "Genesis", indexTitle: "Genesis", textDepth: 2, addressTypes: ["Integer", "Integer"], sectionNames: ["Chapter", "Verse"], isComplex: false });
    const aliasStore = createStore("sefaria-reader-refs-alias", "alias");
    const metaStore = createStore("sefaria-reader-refs-meta", "meta");
    await set("Old.1", { v: "Old 1", at: now - ALIAS_MAX_AGE - 1, b: "x" }, aliasStore);
    await set("Busted.1", { v: "Busted 1", at: now, b: "another-buster" }, aliasStore);
    await set("Exodus", { v: {}, at: now - META_MAX_AGE - 1, b: "x" }, metaStore);
    expect(await sweepRefIndexDisk(now)).toBe(3);
    expect(await keys(aliasStore)).toEqual(["Gen.1.1"]);
    expect(await keys(metaStore)).toEqual(["Genesis"]);
  });
});
