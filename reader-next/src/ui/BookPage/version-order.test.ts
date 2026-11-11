import { describe, expect, it } from "vitest";
import genesis from "../../../fixtures/api/genesis-1/versions.json";
import { bookVersionOrder, versionLanguage, versionRecords, type BookVersion } from "./version-order";

const v = (versionTitle: string, priority: number | string, language = "en", actualLanguage = language) =>
  ({ versionTitle, priority, language, actualLanguage, languageFamilyName: "", direction: "ltr", isSource: false, isPrimary: false }) as BookVersion;

// @feature BOK-007
describe("bookVersionOrder (the old book page's VersionsList sort)", () => {
  it("priority first, highest first; a version without one ('') after every numbered one; then title in code-unit order", () => {
    const out = bookVersionOrder([v("b", ""), v("Zed", 1), v("Alpha", ""), v("Mid", 3.0), v("א", "", "he"), v("Beta", 1)]);
    expect(out.map((x) => x.versionTitle)).toEqual(["Mid", "Beta", "Zed", "Alpha", "b", "א"]);
  });
  it("orders the recorded Genesis versions as sefaria.org lists them (measured 2026-11-11, first eight)", () => {
    expect(bookVersionOrder(genesis as unknown as BookVersion[]).slice(0, 8).map((x) => x.versionTitle.slice(0, 30))).toEqual([
      "THE JPS TANAKH: Gender-Sensiti",
      "The Contemporary Torah, Jewish",
      "The Five Books of Moses, by Ev",
      "The Koren Jerusalem Bible",
      "Metsudah Chumash, Metsudah Pub",
      "The Kehot Chumash; Chabad Hous",
      "Tanakh: The Holy Scriptures, p",
      "Miqra according to the Masorah",
    ]);
  });
});

describe("versionLanguage (the badge)", () => {
  it("a [xx] title suffix wins over the API's actualLanguage (wrong for some), then actualLanguage, then language", () => {
    expect(versionLanguage(v("Tora ve Aftara [tr]", "", "en", "en"))).toBe("tr");
    expect(versionLanguage(v("A German one", "", "en", "de"))).toBe("de");
    expect(versionLanguage({ versionTitle: "Plain", language: "he", actualLanguage: "" })).toBe("he");
  });
});

describe("versionRecords", () => {
  it("keeps version records only: the API's { error } answer, and anything else, is left out", () => {
    expect(versionRecords({ error: "Could not find title" } as never)).toEqual([]);
    expect(versionRecords(["Could not find title", null, v("A", 1)] as never).map((x) => x.versionTitle)).toEqual(["A"]);
    expect(versionRecords(undefined)).toEqual([]);
  });
});
