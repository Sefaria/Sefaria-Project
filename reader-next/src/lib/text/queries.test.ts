import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { server } from "../../../test/msw/server";
import { makeQueryClient } from "~/lib/cache/query-client";
import { resetPersisters } from "~/lib/cache/persisters";
import { RefIndex } from "~/lib/cache/ref-index";
import { fetchPassage, loadReaderPassage, passageUrl, prefetchNeighbours } from "./queries";

let requests: string[] = [];
let fullUrls: string[] = [];
server.events.on("request:start", ({ request }) => {
  const u = new URL(request.url);
  requests.push(decodeURIComponent(u.pathname));
  fullUrls.push(request.url);
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetPersisters();
  requests = [];
  fullUrls = [];
});

/** Wait for fire-and-forget persistence writes to land in IndexedDB. */
const settle = () => new Promise((r) => setTimeout(r, 50));

describe("library cache (core tenet: never fetch twice)", () => {
  // @feature TXD-003 @feature TXD-050
  it("loads a section, then serves a verse inside it with zero requests", async () => {
    const qc = makeQueryClient();
    const idx = new RefIndex();
    const first = await loadReaderPassage(qc, idx, "Genesis 1");
    expect(first.sections[0]!.segments).toHaveLength(31);
    expect(requests).toEqual(["/api/v3/texts/Genesis 1"]);

    requests = [];
    const verse = await loadReaderPassage(qc, idx, "Genesis 1:3");
    expect(requests).toEqual([]);
    expect(verse.sections[0]!.ref).toBe("Genesis 1");
    expect(verse.highlight).toEqual({ from: ["1", "3"], to: ["1", "3"] });
  });

  it("survives a reload: memory gone, IndexedDB serves the text and book metadata", async () => {
    const idx = new RefIndex();
    await loadReaderPassage(makeQueryClient(), idx, "Genesis 1");
    await settle();

    idx.dropMemory();
    requests = [];
    const reloaded = await loadReaderPassage(makeQueryClient(), idx, "Genesis 1:3");
    expect(requests).toEqual([]);
    expect(reloaded.sections[0]!.segments[2]!.ref).toBe("Genesis 1:3");
  });

  it("deduplicates concurrent requests for the same section", async () => {
    const qc = makeQueryClient();
    const idx = new RefIndex();
    await Promise.all([loadReaderPassage(qc, idx, "Berakhot 2a"), loadReaderPassage(qc, idx, "Berakhot 2a")]);
    expect(requests).toEqual(["/api/v3/texts/Berakhot 2a"]);
  });

  // @feature TXD-003
  it("opens a super-section ref at its first available section and remembers the alias", async () => {
    const qc = makeQueryClient();
    const idx = new RefIndex();
    const first = await loadReaderPassage(qc, idx, "Rashi on Genesis 1");
    expect(first.canonicalRef).toBe("Rashi on Genesis 1:1");
    expect(first.sections).toHaveLength(1);
    expect(first.sections[0]!.ref).toBe("Rashi on Genesis 1:1");
    expect(first.sections[0]!.segments[0]!.ref).toBe("Rashi on Genesis 1:1:1");

    requests = [];
    const again = await loadReaderPassage(qc, idx, "Rashi on Genesis 1");
    expect(requests).toEqual([]);
    expect(again.canonicalRef).toBe("Rashi on Genesis 1:1");
  });

  it("prefetches the next section so paging forward is instant", async () => {
    const qc = makeQueryClient();
    const idx = new RefIndex();
    const { sections } = await loadReaderPassage(qc, idx, "Genesis 1");
    prefetchNeighbours(qc, sections[0]!);
    await qc.isFetching();
    await new Promise((r) => setTimeout(r, 50));
    requests = [];
    const next = await loadReaderPassage(qc, idx, "Genesis 2");
    expect(requests).toEqual([]);
    expect(next.sections[0]!.ref).toBe("Genesis 2");
  });
});

describe("neighbour preload", () => {
  // The browser only hands a preloaded response to fetch() when the URLs match exactly.
  // @feature TXD-052 @feature TXD-069
  it.each([
    ["Genesis 2", {}],
    ["Berakhot 3a", {}],
    ["Genesis 1", { translation: "english|The Koren Jerusalem Bible" }],
  ])("passageUrl(%s) is byte-for-byte the URL the client requests", async (ref, sel) => {
    await fetchPassage(ref, sel).catch(() => undefined); // the fixture may not exist; only the request matters
    expect(fullUrls).toContain(passageUrl(ref, sel));
  });
});
