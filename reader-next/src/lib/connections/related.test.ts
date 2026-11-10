import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { makeQueryClient } from "~/lib/cache/query-client";
import { server } from "../../../test/msw/server";
import clientUrls from "../../../fixtures/varnish/related-client-urls.json";
import { expandRange, fetchSectionResources, groupByRef, resourceCounts, resourcesQueryOptions } from "./related";

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

  it("loads and groups a real section (recorded)", async () => {
    const qc = makeQueryClient();
    const res = await qc.fetchQuery(resourcesQueryOptions("Genesis 1"));
    const c = resourceCounts(res, ["Genesis 1:1"], { webpages: null, translations: 0 });
    expect(c.sheets).toBeGreaterThan(0);
    expect(c.manuscripts).toBeGreaterThan(0);
    expect(c.audio).toBeGreaterThan(0);
  });
});

// The exact /api/related URLs this client requests, pinned in fixtures/varnish/related-client-urls.json: Django's Varnish
// invalidation (sefaria/system/varnish/wrapper.py client_url_regex) is tested against the same file (reader/tests/related_api_test.py),
// so a change to the URL the client builds fails here until the file, and with it Django's test, is updated.
// @feature CON-071
describe("the /api/related URL Django's Varnish invalidation must match", () => {
  it.each(Object.entries(clientUrls.urls))("%s → %s", async (sectionRef, expected) => {
    const seen: string[] = [];
    server.use(
      http.get(/\/api\/related\//, ({ request }) => {
        const u = new URL(request.url);
        seen.push(u.pathname + u.search);
        return HttpResponse.json({ sheets: [], topics: [], manuscripts: [], media: [], guides: [] });
      }),
    );
    await fetchSectionResources(sectionRef);
    expect(seen).toEqual([expected]);
  });
});
