import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { queryOptions } from "@tanstack/react-query";
import { createStore, keys } from "idb-keyval";
import { makeQueryClient } from "./query-client";
import { resetPersisters } from "./persisters";
import { withPolicy } from "./query-options";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersisters();
});
const settle = () => new Promise((r) => setTimeout(r, 50));
const onDisk = () => keys<string>(createStore("sefaria-reader", "queries"));

// CODE_REVIEW low: an answer with API warnings (a translation the URL named that does not exist) was kept as fresh and on disk
// for days, so the reader kept getting the fallback even after the version appeared
describe("an API answer with warnings", () => {
  it("is used, but neither kept fresh nor written to disk", async () => {
    const qc = makeQueryClient();
    const warned = { ref: "Genesis 1", warnings: [{ "english|No Such": { warning_code: 101 } }] };
    let calls = 0;
    const options = queryOptions<object>({ ...withPolicy("text", { queryKey: ["text", "Genesis 1", "x"], queryFn: async () => (calls++, warned) }) });
    expect(await qc.fetchQuery(options)).toEqual(warned);
    await settle();
    expect(await onDisk()).toEqual([]);
    await qc.fetchQuery(options); // the next reader of it asks again
    expect(calls).toBe(2);
  });
  it("a clean answer is still kept fresh and on disk", async () => {
    const qc = makeQueryClient();
    let calls = 0;
    const options = queryOptions<object>({ ...withPolicy("text", { queryKey: ["text", "Genesis 1", "y"], queryFn: async () => (calls++, { ref: "Genesis 1", warnings: [] }) }) });
    await qc.fetchQuery(options);
    await settle();
    expect((await onDisk()).length).toBe(1);
    await qc.fetchQuery(options);
    expect(calls).toBe(1);
  });
});
