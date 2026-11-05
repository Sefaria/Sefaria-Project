import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { outcomeOf, repairGershayimVariant, suggestionsFrom, urlForObject, type NameResponse } from "./autocomplete";

const gen = readFixture<NameResponse>("search/name-gen.json");
const rashi = readFixture<NameResponse>("search/name-rashi-on-gen.json");

// @feature SRC-003 @feature SRC-006 @feature SRC-007 @feature SRC-009 @feature SRC-008 @feature SRC-005
describe("suggestions", () => {
  it("'gen': the Search-for row, then Topics, then Books (VERIFIED on sefaria.org)", () => {
    const s = suggestionsFrom("gen", gen);
    expect(s[0]).toEqual({ type: "search", label: "gen" });
    const types = s.map((x) => x.type);
    expect([...new Set(types)]).toEqual(["search", "Topic", "ref"]);
    expect(s.filter((x) => x.type === "Topic").slice(0, 3).map((x) => x.label)).toEqual(["Gender", "Genesis", "Geniva"]); // a PersonTopic counts as a Topic
    expect(s.filter((x) => x.type === "ref").map((x) => x.label)).toEqual(["Genesis", "Gen. R."]);
  });
  it("'rashi on gen': Authors, Topics, Categories, Books — the old reversed order", () => {
    const s = suggestionsFrom("rashi on gen", rashi);
    expect([...new Set(s.map((x) => x.type))]).toEqual(["search", "AuthorTopic", "Topic", "TocCategory", "ref"]);
    expect(s.filter((x) => x.type === "ref")[0]!.label).toBe("Rashi on Genesis");
  });
  it("urls: book → its page, category → /texts path, topic → the library's topic page", () => {
    expect(urlForObject("ref", "Rashi on Genesis")).toBe("/Rashi_on_Genesis");
    expect(urlForObject("TocCategory", ["Tanakh", "Torah"])).toBe("/texts/Tanakh/Torah");
    expect(urlForObject("Topic", "gender")).toBe("https://www.sefaria.org/topics/gender");
    expect(urlForObject("Collection", "x")).toBeUndefined();
  });
  it("nothing completes: no dropdown", () => {
    expect(suggestionsFrom("zzzxqkw", readFixture<NameResponse>("search/name-none.json"))).toEqual([]);
  });
});

// @feature SRC-002 @feature SRC-011 @feature SRC-012 @feature SRC-013 @feature SRC-015
describe("what Enter does", () => {
  it("a citation opens the text; a book name opens the book", () => {
    expect(outcomeOf("Genesis 1:3", readFixture<NameResponse>("search/name-genesis-1-3.json"))).toEqual({ kind: "ref", ref: "Genesis 1:3", isBook: false });
    expect(outcomeOf("Genesis", readFixture<NameResponse>("search/name-genesis.json"))).toMatchObject({ kind: "ref", ref: "Genesis", isBook: true });
  });
  it("a miscapitalised citation still resolves (the API repairs it)", () => {
    expect(outcomeOf("genesis 1", readFixture<NameResponse>("search/name-genesis-lower.json"))).toMatchObject({ kind: "ref", ref: "Genesis 1" });
  });
  it("anything else is a full-text search", () => {
    expect(outcomeOf("zzzxqkw", readFixture<NameResponse>("search/name-none.json"))).toEqual({ kind: "search", query: "zzzxqkw" });
    expect(outcomeOf("Shema", readFixture<NameResponse>("search/name-shema.json"))).toEqual({ kind: "search", query: "Shema" });
  });
  it("a name typed with a gershayim matches the stored quote", () => {
    expect(repairGershayimVariant("רש״י", { is_ref: false, completions: ['רש"י'] })).toBe('רש"י');
    expect(repairGershayimVariant("Shema", { is_ref: false, completions: ["Shema"] })).toBe("Shema");
  });
});
