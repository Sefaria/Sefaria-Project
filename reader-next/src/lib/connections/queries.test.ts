import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { readFixture } from "../../../test/msw/fixtures";
import { makeIndexLookup, type RelatedLink } from "./links";
import { fetchSectionLinks, linkCountsBySegment, linksQueryOptions } from "./queries";

const links = readFixture<RelatedLink[]>("genesis-1/links.json");
const lookup = makeIndexLookup(undefined, links);

// @feature CON-071
describe("section links", () => {
  it("fetches a section's links from the API", async () => {
    const got = await fetchSectionLinks("Genesis 1");
    expect(got.length).toBeGreaterThan(100);
    expect(got[0]).toHaveProperty("anchorRefExpanded");
    expect(got[0]).toHaveProperty("collectiveTitle");
  });

  it("is cached: a second read makes no request", async () => {
    const qc = new QueryClient();
    await qc.ensureQueryData(linksQueryOptions("Genesis 1"));
    const again = await qc.ensureQueryData(linksQueryOptions("Genesis 1"));
    expect(again.length).toBeGreaterThan(100);
  });
});

// @feature CON-029
describe("linkCountsBySegment", () => {
  it("counts every link on its verse, ignoring essays", () => {
    const counts = linkCountsBySegment(links, [], lookup);
    expect(counts["Genesis 1:1"]).toBeGreaterThan(50);
    const withEssays = links.filter((l) => l.type === "essay");
    expect(withEssays.length).toBeGreaterThan(0);
  });

  it("follows the filter: only Rashi's comments", () => {
    const rashi = linkCountsBySegment(links, ["Rashi"], lookup);
    expect(rashi["Genesis 1:1"]).toBe(3);
    const all = linkCountsBySegment(links, [], lookup);
    expect(all["Genesis 1:1"]).toBeGreaterThan(rashi["Genesis 1:1"]!);
  });

  it("counts a link once per verse even if it names the verse twice", () => {
    const l = { ...links.find((x) => x.type !== "essay")!, anchorRefExpanded: ["Genesis 1:1", "Genesis 1:1", "Genesis 1:2"] };
    expect(linkCountsBySegment([l], [], lookup)).toEqual({ "Genesis 1:1": 1, "Genesis 1:2": 1 });
  });

  it("is empty for no links", () => expect(linkCountsBySegment([], [], lookup)).toEqual({}));
});
