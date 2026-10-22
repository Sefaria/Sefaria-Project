import { describe, expect, it } from "vitest";
import { makeQueryClient } from "~/lib/cache/query-client";
import { entriesForCategories, lexiconQueryOptions, normalizeSelection, shouldActivateLookup } from "./lookup";

// @feature CON-043 @feature TXD-059 @feature CON-042
describe("which selections are looked up (verified on sefaria.org)", () => {
  it("one to three Hebrew words, split on the old separators", () => {
    expect(shouldActivateLookup("בְּרֵאשִׁ֖ית")).toBe(true);
    expect(shouldActivateLookup("בְּרֵאשִׁ֖ית בָּרָ֣א")).toBe(true);
    expect(shouldActivateLookup("בראשית ברא אלהים")).toBe(true);
    expect(shouldActivateLookup("בראשית־ברא:אלהים")).toBe(true); // maqaf and colon separate words
  });
  it("four words, or text with no Hebrew, are not", () => {
    expect(shouldActivateLookup("בראשית ברא אלהים את")).toBe(false);
    expect(shouldActivateLookup("In the beginning")).toBe(false); // the old regex let any text with a space through
    expect(shouldActivateLookup("a: b. c")).toBe(false);
    expect(shouldActivateLookup("Genesis")).toBe(false);
    expect(shouldActivateLookup("")).toBe(false);
    expect(shouldActivateLookup(undefined)).toBe(false);
  });
  it("a typed search always looks up", () => {
    expect(shouldActivateLookup("hello", true)).toBe(true);
  });
  it("normalises a selection", () => {
    expect(normalizeSelection("  בראשית \n\t ברא  ")).toBe("בראשית ברא");
  });
});

describe("which entries apply to the text (verified: Genesis 1:1 shows BDB Augmented Strong, Jastrow and BDB)", () => {
  const entry = (name: string, cats: string[]) => ({ headword: "x", parent_lexicon: name, content: {}, parent_lexicon_details: { to_language: "eng", text_categories: cats } });
  const entries = [entry("Strong", ["Tanakh, Torah", "Tanakh, Prophets"]), entry("Jastrow", []), entry("Klein", ["Talmud, Bavli"])];
  it("keeps lexicons for these categories and unrestricted ones", () => {
    expect(entriesForCategories(entries, ["Tanakh", "Torah"]).map((e) => e.parent_lexicon)).toEqual(["Strong", "Jastrow"]);
    expect(entriesForCategories(entries, ["Talmud", "Bavli"]).map((e) => e.parent_lexicon)).toEqual(["Jastrow", "Klein"]);
  });
  it("a typed search is not filtered", () => {
    expect(entriesForCategories(entries, undefined)).toHaveLength(3);
  });
  it("loads the real entries (recorded): three dictionaries for בְּרֵאשִׁ֖ית in Genesis 1:1", async () => {
    const all = await makeQueryClient().fetchQuery(lexiconQueryOptions("בְּרֵאשִׁ֖ית", "Genesis 1:1"));
    expect(all.map((e) => e.parent_lexicon)).toEqual(["BDB Augmented Strong", "Jastrow Dictionary", "BDB Dictionary"]);
    expect(entriesForCategories(all, ["Tanakh", "Torah"])).toHaveLength(3);
  });
});
