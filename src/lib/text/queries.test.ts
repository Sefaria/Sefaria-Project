import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { server } from "../../../test/msw/server";
import { makeQueryClient } from "~/lib/cache/query-client";
import { resetPersisters } from "~/lib/cache/persisters";
import { RefIndex } from "~/lib/cache/ref-index";
import { fetchPassage, loadReaderPassage, MAX_INITIAL_SECTIONS, passageUrl, prefetchNeighbours, textQueryKey } from "./queries";

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

// CODE_REVIEW R-05: a long range used to load every one of its sections at once (Psalms 1-150 → 150 requests in one page render)
describe("a long range loads only its first sections", () => {
  it("Genesis 1:1-10:5 loads Genesis 1–4 up front and keeps the whole range's highlight", async () => {
    const qc = makeQueryClient();
    const idx = new RefIndex();
    await loadReaderPassage(qc, idx, "Genesis 1");
    const g1 = qc.getQueryData(textQueryKey("Genesis 1", {}))!;
    for (let n = 2; n <= 10; n++) qc.setQueryData(textQueryKey(`Genesis ${n}`, {}), { ...g1, ref: `Genesis ${n}`, sectionRef: `Genesis ${n}` });
    const r = await loadReaderPassage(qc, idx, "Genesis 1:1-10:5");
    expect(r.sections).toHaveLength(MAX_INITIAL_SECTIONS);
    expect(r.sections.map((s) => s.ref)).toEqual(["Genesis 1", "Genesis 2", "Genesis 3", "Genesis 4"]);
    expect(r.highlight).toEqual({ from: ["1", "1"], to: ["10", "5"] });
  });
});

// CODE_REVIEW low: a commentary range across chapters (its sections cannot be enumerated without the API) lost its highlight
describe("a commentary range across chapters", () => {
  it("shows the sections the API names and highlights the range", async () => {
    const qc = makeQueryClient();
    const idx = new RefIndex();
    const got = await loadReaderPassage(qc, idx, "Rashi on Genesis 1:31:1-2:2:1");
    expect(got.canonicalRef).toBe("Rashi on Genesis 1:31:1-2:2:1");
    expect(got.sections.map((s) => s.ref)).toEqual(["Rashi on Genesis 1:31", "Rashi on Genesis 2:2"]);
    expect(got.highlight).toEqual({ from: ["1", "31", "1"], to: ["2", "2", "1"] });
  });
});

// review F04: a section that arrived after a version change was added in the old versions, and stayed in them
describe("fetchInWantedVersions", () => {
  it("fetches again in the versions wanted now when they changed while the section loaded", async () => {
    const { fetchInWantedVersions } = await import("./queries");
    let wanted = { translation: "english|OLD" };
    const asked: string[] = [];
    const passage = await fetchInWantedVersions(
      async (sel) => {
        asked.push(sel.translation!);
        if (sel.translation === "english|OLD") wanted = { translation: "english|NEW" }; // the reader changes version meanwhile
        return { ref: "Genesis 2", translationVersion: { versionTitle: sel.translation } } as never;
      },
      () => wanted,
    );
    expect(asked).toEqual(["english|OLD", "english|NEW"]);
    expect((passage as unknown as { translationVersion: { versionTitle: string } }).translationVersion.versionTitle).toBe("english|NEW");
  });
  it("one fetch when nothing changed", async () => {
    const { fetchInWantedVersions } = await import("./queries");
    let n = 0;
    await fetchInWantedVersions(async () => (n++, { ref: "Genesis 2" } as never), () => ({ translation: "english|A" }));
    expect(n).toBe(1);
  });
});

// review F09: a range in a book not met yet downloaded the whole range before the first-sections cap applied
describe("a cold long range", () => {
  it("learns the book from the range's first point and asks for no more than its first sections", async () => {
    const { http, HttpResponse } = await import("msw");
    const { readFixture } = await import("../../../test/msw/fixtures");
    const genesis1 = readFixture<Record<string, unknown>>("genesis-1/v3-texts.json");
    server.use(http.get("*/api/v3/texts/Genesis%201%3A1", () => HttpResponse.json(genesis1)));
    const qc = makeQueryClient();
    const g1 = (await import("./model")).normaliseTexts(genesis1 as never);
    for (let n = 3; n <= 10; n++) qc.setQueryData(textQueryKey(`Genesis ${n}`, {}), { ...g1, ref: `Genesis ${n}`, sectionRef: `Genesis ${n}` });
    const r = await loadReaderPassage(qc, new RefIndex(), "Genesis 1:1-10:5");
    expect(r.sections.map((s) => s.ref)).toEqual(["Genesis 1", "Genesis 2", "Genesis 3", "Genesis 4"]);
    expect(r.highlight).toEqual({ from: ["1", "1"], to: ["10", "5"] });
    expect(requests.some((p) => p.includes("1:1-10:5"))).toBe(false);
  });
});
