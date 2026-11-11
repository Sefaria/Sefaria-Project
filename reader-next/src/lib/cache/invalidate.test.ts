import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStore, keys } from "idb-keyval";
import { hashKey, QueryClient } from "@tanstack/react-query";
import { createIdbStorage, resetIdbStore } from "./storage";
import { bookOf, EDITOR_LEAVE_WAIT_MS, forgetBeforeEditor, forgetOnDisk, invalidateAfterEditorReturn, invalidateAfterWrite, keyOfDiskEntry, matchersFor, pendingDiskInvalidation, writeFromEditorUrl, type Write } from "./invalidate";
import { POLICIES, setStaffFreshness, staleTimeFor } from "./policies";

const HOUR = 3_600_000;
const matches = (w: Write, key: unknown[]) => matchersFor(w).some((m) => m(key));
const entry = (key: unknown[]) => ({ buster: "x", queryHash: hashKey(key), queryKey: key, state: { data: 1, dataUpdatedAt: 1, status: "success" } }) as never;
const queries = () => keys<string>(createStore("sefaria-reader", "queries"));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetIdbStore();
  setStaffFreshness(false);
});

// Regression (docs/DECISIONS.md, D-7): text was fresh for 7 days, so an edit could stay invisible for a week
describe("freshness", () => {
  it("text and catalog are asked again after an hour; the disk still keeps them for 30 days", () => {
    expect(POLICIES.text.staleTime).toBe(HOUR);
    expect(POLICIES.catalog.staleTime).toBe(HOUR);
    expect(POLICIES.text.maxAge).toBe(30 * 24 * HOUR);
    expect(staleTimeFor("text")).toBe(HOUR);
  });
  it("staff always revalidate text and catalog (D-7)", () => {
    setStaffFreshness(true);
    expect(staleTimeFor("text")).toBe(0);
    expect(staleTimeFor("catalog")).toBe(0);
    expect(staleTimeFor("connections")).toBe(HOUR);
  });
  it("the query client learns who is staff from the viewer query", async () => {
    const { makeQueryClient } = await import("./query-client");
    const qc = makeQueryClient();
    qc.setQueryData(["user", "viewer"], { id: 1, isStaff: true });
    expect(staleTimeFor("text")).toBe(0);
    qc.setQueryData(["user", "viewer"], null);
    expect(staleTimeFor("text")).toBe(HOUR);
  });
});

describe("what a write makes wrong", () => {
  it("a text edit: the book's texts in every version, its versions list and index, and links; not other books", () => {
    const w: Write = { kind: "text", ref: "Genesis 1:3" };
    expect(matches(w, ["text", "Genesis 1", "~"])).toBe(true);
    expect(matches(w, ["text", "Genesis 50", "hebrew|Miqra~english|JPS"])).toBe(true);
    expect(matches(w, ["compare", "text", "Genesis 2", "en", "JPS"])).toBe(true);
    expect(matches(w, ["versions", "Genesis"])).toBe(true);
    expect(matches(w, ["catalog", "index-details", "Genesis"])).toBe(true);
    expect(matches(w, ["links", "Genesis 1"])).toBe(true);
    expect(matches(w, ["text", "Exodus 1", "~"])).toBe(false);
    expect(matches(w, ["text", "Genesisology 1", "~"])).toBe(false);
    expect(matches(w, ["catalog", "toc"])).toBe(false);
  });
  it("a complex text's node edit takes the whole book", () => {
    expect(bookOf("Pesach Haggadah, Kadesh 3")).toBe("Pesach Haggadah");
    expect(matches({ kind: "text", ref: "Pesach Haggadah, Kadesh 3" }, ["text", "Pesach Haggadah, Magid, Ha Lachma Anya 1", "~"])).toBe(true);
    expect(matches({ kind: "text", ref: "Berakhot 2a:3" }, ["text", "Berakhot 2a", "~"])).toBe(true);
  });
  it("links, lexicon, topics and notes", () => {
    expect(matches({ kind: "links" }, ["links", "Genesis 1"])).toBe(true);
    expect(matches({ kind: "links" }, ["resources", "Genesis 1"])).toBe(true);
    expect(matches({ kind: "lexicon" }, ["lexicon", "v2", "אור", "Genesis 1:3"])).toBe(true);
    expect(matches({ kind: "topic", slug: "light" }, ["topics", "topic", "light"])).toBe(true);
    expect(matches({ kind: "topic", slug: "light" }, ["topics", "topic", "dark"])).toBe(false);
    expect(matches({ kind: "topic", slug: "light" }, ["resources", "Genesis 1"])).toBe(false); // patched in place, not refetched (SB-03)
    expect(matches({ kind: "notes" }, ["user", "notes", 1, ["Genesis 1:1"]])).toBe(true);
    expect(matches({ kind: "notes" }, ["user", "viewer"])).toBe(false);
  });
  it("reads a disk key back into its query key", () => {
    expect(keyOfDiskEntry(`sr-text-${hashKey(["text", "Genesis 1", "~"])}`)).toEqual(["text", "Genesis 1", "~"]);
    expect(keyOfDiskEntry("sr-text-not json")).toBeUndefined();
    expect(keyOfDiskEntry("something-else")).toBeUndefined();
  });
});

describe("invalidation reaches the disk", () => {
  it("deletes the stored copies a write made wrong, and only those", async () => {
    const s = createIdbStorage()!;
    for (const k of [["text", "Genesis 1", "~"], ["text", "Genesis 2", "~"], ["text", "Exodus 1", "~"], ["lexicon", "v2", "אור", ""]]) await s.setItem(`sr-text-${hashKey(k)}`, entry(k));
    expect(await forgetOnDisk({ kind: "text", ref: "Genesis 1:1" })).toBe(2);
    expect((await queries()).map((k) => keyOfDiskEntry(k)?.[1])).toEqual(expect.arrayContaining(["Exodus 1", "v2"]));
    expect(await queries()).toHaveLength(2);
  });
  it("invalidateAfterWrite also marks the queries in memory stale and refetches what is on screen", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["text", "Genesis 1", "~"], "old");
    qc.setQueryData(["text", "Exodus 1", "~"], "old");
    await invalidateAfterWrite(qc, { kind: "text", ref: "Genesis 1:1" });
    expect(qc.getQueryState(["text", "Genesis 1", "~"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["text", "Exodus 1", "~"])?.isInvalidated).toBe(false);
  });
  it("works with no IndexedDB at all, and with one that throws", async () => {
    // @ts-expect-error: a browser without IndexedDB (some private modes)
    delete globalThis.indexedDB;
    resetIdbStore();
    expect(await forgetOnDisk({ kind: "links" })).toBe(0);
    globalThis.indexedDB = { open: () => { throw new Error("blocked"); } } as never;
    resetIdbStore();
    expect(await forgetOnDisk({ kind: "links" })).toBe(0);
    await expect(invalidateAfterWrite(new QueryClient(), { kind: "notes" })).resolves.toBeUndefined();
  });
});

describe("a return from a Django editor", () => {
  const origin = "https://www.sefaria.org";
  it("knows the editors and admin resets and what each one changes (sefaria/urls_library.py, urls_shared.py)", () => {
    const w = (path: string) => writeFromEditorUrl(`${origin}${path}`, origin);
    expect(w("/edit/Genesis.1.3/en/The_Contemporary_Torah")).toEqual({ kind: "text", ref: "Genesis 1:3" });
    expect(w("/translate/Berakhot.2a.3?next=%2FBerakhot.2a")).toEqual({ kind: "text", ref: "Berakhot 2a:3" });
    expect(w("/add/Rashi_on_Genesis.1.1")).toEqual({ kind: "text", ref: "Rashi on Genesis 1:1" });
    expect(w("/add/textinfo/Genesis")).toEqual({ kind: "book", title: "Genesis" });
    expect(w("/add/textinfo/Pesach_Haggadah")).toEqual({ kind: "book", title: "Pesach Haggadah" });
    expect(w("/admin/reset/cache/Genesis")).toEqual({ kind: "book", title: "Genesis" });
    expect(w("/admin/reset/counts/Genesis")).toEqual({ kind: "book", title: "Genesis" });
    expect(w("/admin/reset/toc")).toEqual({ kind: "catalog" });
    expect(w("/admin/reset/cache")).toEqual({ kind: "catalog" });
    expect(w("/admin/reset/counts/all")).toEqual({ kind: "catalog" });
    expect(w("/admin/reset/varnish/Genesis.1")).toEqual({ kind: "text", ref: "Genesis 1" });
    expect(w("/admin/reset/Genesis.1")).toEqual({ kind: "text", ref: "Genesis 1" });
    for (const none of ["/admin/reset/ac", "/admin/reset/api/texts", "/edit/terms/Bereshit", "/add/terms/x", "/add/new", "/Genesis.1"]) expect(w(none)).toBeUndefined();
    expect(writeFromEditorUrl(`https://evil.example/edit/Genesis.1`, origin)).toBeUndefined(); // another site's referrer is no edit
    expect(writeFromEditorUrl("not a url", origin)).toBeUndefined();
    // the site origin or the page's own
    expect(writeFromEditorUrl("http://localhost:3000/edit/Genesis.1", [origin, "http://localhost:3000"])).toEqual({ kind: "text", ref: "Genesis 1" });
  });
  it("a TOC reset makes the whole catalog wrong", () => {
    expect(matches({ kind: "catalog" }, ["catalog", "toc"])).toBe(true);
    expect(matches({ kind: "catalog" }, ["catalog", "index-details", "Genesis"])).toBe(true);
    expect(matches({ kind: "catalog" }, ["text", "Genesis 1", "~"])).toBe(false);
  });
  it("forgets the edited book on disk before any disk read; only on a navigation, not a reload or Back", async () => {
    const s = createIdbStorage()!;
    for (const k of [["text", "Genesis 1", "~"], ["text", "Exodus 1", "~"]]) await s.setItem(`sr-text-${hashKey(k)}`, entry(k));
    const doc = { referrer: `${origin}/edit/Genesis.1.3/en/JPS`, location: { origin: "http://localhost" } };
    expect(invalidateAfterEditorReturn(doc, { siteOrigin: origin, navigationType: "reload" })).toBeUndefined();
    expect(invalidateAfterEditorReturn(doc, { siteOrigin: origin, navigationType: "back_forward" })).toBeUndefined();
    expect((await queries()).length).toBe(2);
    expect(invalidateAfterEditorReturn(doc, { siteOrigin: origin, navigationType: "navigate" })).toEqual({ kind: "text", ref: "Genesis 1:3" });
    await pendingDiskInvalidation();
    expect((await queries()).map((k) => keyOfDiskEntry(k)?.[1])).toEqual(["Exodus 1"]);
    expect(invalidateAfterEditorReturn({ referrer: `${origin}/Genesis.1`, location: { origin } }, { navigationType: "navigate" })).toBeUndefined();
    expect(invalidateAfterEditorReturn({ referrer: "", location: { origin } })).toBeUndefined();
  });
});

describe("a hanging IndexedDB never holds up a write (review)", () => {
  const hanging = { open: () => ({}) as IDBOpenDBRequest } as unknown as IDBFactory;
  it("the memory is invalidated at once; leaving for an editor waits at most a moment", async () => {
    globalThis.indexedDB = hanging;
    resetIdbStore();
    const qc = new QueryClient();
    qc.setQueryData(["text", "Genesis 1", "~"], "old");
    const t0 = Date.now();
    await invalidateAfterWrite(qc, { kind: "text", ref: "Genesis 1:1" });
    expect(Date.now() - t0).toBeLessThan(200);
    expect(qc.getQueryState(["text", "Genesis 1", "~"])?.isInvalidated).toBe(true);
    const t1 = Date.now();
    await forgetBeforeEditor({ kind: "text", ref: "Genesis 1:1" });
    expect(Date.now() - t1).toBeLessThan(EDITOR_LEAVE_WAIT_MS + 200);
  });
  it("links and notes live in memory only: no disk scan at all", async () => {
    let opened = 0;
    globalThis.indexedDB = { open: () => (opened++, {}) as IDBOpenDBRequest } as unknown as IDBFactory;
    resetIdbStore();
    expect(await forgetOnDisk([{ kind: "links" }, { kind: "notes" }])).toBe(0);
    expect(opened).toBe(0);
  });
});
