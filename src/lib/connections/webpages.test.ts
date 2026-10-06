import { describe, expect, it } from "vitest";
import pages from "../../../fixtures/api/berakhot-2a/websites-2a-1.json";
import { authorsString, isHebrewText, mergePages, sitesOf, sortPages, type WebPageItem } from "./webpages";

const all = pages as unknown as WebPageItem[];

// @feature CON-052 @feature CON-053
describe("web pages for Berakhot 2a:1 (compared with sefaria.org)", () => {
  it("sites: English first by number of pages, then the Hebrew sites — the same list the live sidebar shows", () => {
    const sites = sitesOf(all, "english");
    expect(sites.slice(0, 5).map((s) => `${s.name} (${s.count})`)).toEqual([
      "Halachipedia (145)", "Torat Har Etzion (120)", "Orthodox Union (OU Torah) (48)", "Times of Israel Blogs (28)", "Hadran (21)",
    ]);
    expect(sites.length).toBe(31);
    const firstHebrew = sites.findIndex((s) => isHebrewText(s.name));
    expect(sites.slice(firstHebrew).every((s) => isHebrewText(s.name))).toBe(true);
    expect(sites[firstHebrew]).toMatchObject({ name: "פרויקט בן-יהודה", count: 48 });
  });
  it("a Hebrew interface puts the Hebrew sites first", () => {
    expect(isHebrewText(sitesOf(all, "hebrew")[0]!.name)).toBe(true);
  });
  const page = (o: Partial<WebPageItem>): WebPageItem => ({ url: "u", title: "t", linkerHits: 0, domain: "d", siteName: "s", favicon: "f", anchorRef: "Genesis 1:2", anchorRefExpanded: ["Genesis 1:2"], ...o });
  it("pages: the interface language first, then fewer verses, then single verses before ranges, then Linker hits", () => {
    const sorted = sortPages(
      [
        page({ url: "a", title: "עברית" }),
        page({ url: "b", title: "wide", anchorRef: "Genesis 1", anchorRefExpanded: ["Genesis 1:1", "Genesis 1:2", "Genesis 1:3"] }),
        page({ url: "c", title: "range", anchorRef: "Genesis 1:2-3", anchorRefExpanded: ["Genesis 1:2", "Genesis 1:3"] }),
        page({ url: "d", title: "one-low", linkerHits: 1 }),
        page({ url: "e", title: "one-high", linkerHits: 9 }),
      ],
      "english",
    );
    expect(sorted.map((p) => p.url)).toEqual(["e", "d", "c", "b", "a"]);
    expect(sortPages([page({ url: "x", title: "english" }), page({ url: "y", title: "עברית" })], "hebrew").map((p) => p.url)).toEqual(["y", "x"]);
  });
  it("merges the pages of several refs, once each", () => {
    expect(mergePages([[page({ url: "a" })], [page({ url: "a" }), page({ url: "b" })], undefined]).map((p) => p.url)).toEqual(["a", "b"]);
  });
  it("authors read 'First Last', joined with and / ו", () => {
    expect(authorsString(["Sacks, Jonathan"], false)).toBe("Jonathan Sacks");
    expect(authorsString(["A, B", "C, D", "E, F"], false)).toBe("B A, D C and F E");
    expect(authorsString(["A, B", "C, D"], true)).toBe("B A וD C");
    expect(authorsString(null, false)).toBe("");
  });
});
