import { describe, expect, it } from "vitest";
import { makeQueryClient } from "~/lib/cache/query-client";
import { expandRange, groupByRef, resourceCounts, resourcesQueryOptions } from "./related";

// @feature CON-014 @feature CON-071
describe("related resources", () => {
  it("expands a verse range within a section", () => {
    expect(expandRange("Genesis 1:3-5")).toEqual(["Genesis 1:3", "Genesis 1:4", "Genesis 1:5"]);
    expect(expandRange("Berakhot 2a:4-5")).toEqual(["Berakhot 2a:4", "Berakhot 2a:5"]);
    expect(expandRange("Genesis 1:3")).toEqual(["Genesis 1:3"]);
    expect(expandRange("Genesis 1:31-2:3")).toEqual(["Genesis 1:31-2:3"]);
  });

  it("files items under each verse they cover (old _saveItemsByRef), preferring anchorRefExpanded", () => {
    const by = groupByRef([
      { id: 1, anchorRef: "Genesis 1:1-2" },
      { id: 2, anchorRef: "Genesis 1:1", anchorRefExpanded: ["Genesis 1:1"] },
      { id: 3 },
    ]);
    expect(Object.keys(by).sort()).toEqual(["Genesis 1:1", "Genesis 1:2"]);
    expect(by["Genesis 1:1"]!.map((x) => x.id)).toEqual([1, 2]);
  });

  it("counts like the old panel: sheets by id and topics by slug without double counting", () => {
    const res = {
      sheets: groupByRef([{ id: 7, anchorRef: "Genesis 1:1-2" }, { id: 8, anchorRef: "Genesis 1:2" }]),
      topics: groupByRef([{ topic: "light", anchorRef: "Genesis 1:3" }, { topic: "light", anchorRef: "Genesis 1:4" }]),
      manuscripts: groupByRef([{ anchorRef: "Genesis 1:1-26" }]),
      media: groupByRef([{ anchorRef: "Genesis 1:1" }]),
      guides: {},
    };
    expect(resourceCounts(res, ["Genesis 1:1", "Genesis 1:2"], { webpages: null, translations: 46 })).toEqual({
      sheets: 2, webpages: null, audio: 1, topics: 0, manuscripts: 2, guides: 0, translations: 46,
    });
    expect(resourceCounts(res, ["Genesis 1:3", "Genesis 1:4"], { webpages: 0, translations: 0 }).topics).toBe(1);
  });

  // @feature CON-014 Sheets count with the reader's own sheets (old sheetsTotalCount, T-G04)
  it("signed in, counts the reader's own sheets (private too) without counting their public ones twice", () => {
    const res = {
      sheets: groupByRef([
        { id: 1, owner: 7, anchorRef: "Genesis 1:1" }, // someone's public sheet
        { id: 2, owner: 42, anchorRef: "Genesis 1:1" }, // my public sheet: also in my list
      ]),
      topics: {}, manuscripts: {}, media: {}, guides: {},
    };
    const mine = groupByRef([
      { id: 2, owner: 42, anchorRef: "Genesis 1:1" },
      { id: 3, owner: 42, anchorRef: "Genesis 1:1-2" }, // private
      { id: 4, owner: 42, anchorRef: "Genesis 1:5" }, // elsewhere in the chapter
    ]);
    expect(resourceCounts(res, ["Genesis 1:1"], { webpages: null, translations: 0 }).sheets).toBe(2);
    expect(resourceCounts(res, ["Genesis 1:1"], { webpages: null, translations: 0, mine: { uid: 42, sheets: mine } }).sheets).toBe(3);
    expect(resourceCounts(res, ["Genesis 1:2"], { webpages: null, translations: 0, mine: { uid: 42, sheets: mine } }).sheets).toBe(1);
  });

  it("loads and groups a real section (recorded)", async () => {
    const qc = makeQueryClient();
    const res = await qc.fetchQuery(resourcesQueryOptions("Genesis 1"));
    const c = resourceCounts(res, ["Genesis 1:1"], { webpages: null, translations: 0 });
    expect(c.sheets).toBeGreaterThan(0);
    expect(c.manuscripts).toBeGreaterThan(0);
    expect(c.audio).toBeGreaterThan(0);
  });
});
