import { describe, expect, it } from "vitest";
import { formatWith, parseWith, withHref } from "./url";

// @feature RTE-044 @feature CON-006
describe("parseWith", () => {
  it("returns nothing when the sidebar is closed", () => expect(parseWith(undefined)).toBeUndefined());
  it("all (or empty) is the Resources view", () => {
    expect(parseWith("all")).toEqual({ view: "resources" });
    expect(parseWith("")).toEqual({ view: "resources" });
  });
  it("a category list", () => {
    expect(parseWith("Commentary ConnectionsList")).toEqual({ view: "category", category: "Commentary" });
    expect(parseWith("Jewish_Thought_ConnectionsList")).toEqual({ view: "category", category: "Jewish Thought" });
  });
  it("a named sidebar mode", () => {
    expect(parseWith("Translations")).toEqual({ view: "mode", mode: "Translations" });
    expect(parseWith("Torah_Readings")).toEqual({ view: "mode", mode: "Torah Readings" });
  });
  it("anything else is a connected-texts filter, with suffixes preserved", () => {
    expect(parseWith("Rashi")).toEqual({ view: "texts", filter: "Rashi" });
    expect(parseWith("Sforno_on_Genesis|Quoting")).toEqual({ view: "texts", filter: "Sforno on Genesis|Quoting" });
    expect(parseWith("Talmud")).toEqual({ view: "texts", filter: "Talmud" });
  });
});

// @feature CON-052 Web pages citing this text
describe("web pages views", () => {
  it("the sites list, and one site's pages (names keep their spaces and underscores)", () => {
    expect(parseWith("WebPages")).toEqual({ view: "webpages" });
    expect(parseWith("WebPage:my_site")).toEqual({ view: "webpages", site: "my_site" });
  });
});

describe("formatWith / withHref", () => {
  it.each([
    [{ view: "resources" } as const, "all"],
    [{ view: "category", category: "Commentary" } as const, "Commentary ConnectionsList"],
    [{ view: "texts", filter: "Rashi" } as const, "Rashi"],
    [{ view: "mode", mode: "About" } as const, "About"],
    [{ view: "webpages" } as const, "WebPages"],
    [{ view: "webpages", site: "Times of Israel Blogs" } as const, "WebPage:Times of Israel Blogs"],
  ])("round-trips %j", (v, str) => {
    expect(formatWith(v)).toBe(str);
    expect(parseWith(formatWith(v))).toEqual(v);
  });
  it("builds a real href", () => {
    expect(withHref("/Genesis.1.1", { view: "category", category: "Commentary" })).toBe("/Genesis.1.1?with=Commentary+ConnectionsList");
    expect(withHref("/Genesis.1.1", { view: "texts", filter: "Rashi" }, "&lang=en")).toBe("/Genesis.1.1?with=Rashi&lang=en");
  });
});
