import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { applySearchToSettings, carrySearch, decodeVtitle, encodeVtitle, validateReaderSearch, versionParamToApi, versionSelectionFromSearch } from "./url-state";

// @feature RTE-043 @feature RTE-046 @feature RTE-028
describe("validateReaderSearch", () => {
  // @feature SHL-066
  it("keeps further panels' parameters (p2, w2, lang2, aliyot2, ven2, vhe2…) and drops empty ones", () => {
    expect(validateReaderSearch({ p2: "Exodus.1", w2: "Rashi", lang2: "en", aliyot3: 1, vhe3: "hebrew|X", p4: "", px: "no" })).toEqual({
      p2: "Exodus.1", w2: "Rashi", lang2: "en", aliyot3: "1", vhe3: "hebrew|X",
    });
  });
  it("keeps valid values", () => {
    expect(validateReaderSearch({ lang: "he", aliyot: "1", ven: "english|The_JPS", vhe: "hebrew|Miqra" })).toEqual({
      lang: "he", aliyot: 1, ven: "english|The_JPS", vhe: "hebrew|Miqra",
    });
  });
  it("drops invalid and unknown values", () => {
    expect(validateReaderSearch({ lang: "klingon", aliyot: "2", ven: "no-pipe", other: "x" })).toEqual({});
  });
  it("keeps the sidebar view", () => {
    expect(validateReaderSearch({ with: "Commentary ConnectionsList" })).toEqual({ with: "Commentary ConnectionsList" });
  });
  it("accepts numeric aliyot from the router", () => {
    expect(validateReaderSearch({ aliyot: 0 })).toEqual({ aliyot: 0 });
  });
});

describe("version params", () => {
  it("decodes underscores and escaped semicolons", () => {
    expect(decodeVtitle("Tanakh:_The_Holy_Scriptures%3B_2nd_ed")).toBe("Tanakh: The Holy Scriptures; 2nd ed");
  });
  it("round-trips titles", () => {
    const t = "The Koren Jerusalem Bible; 2nd ed";
    expect(decodeVtitle(encodeVtitle(t))).toBe(t);
  });
  it("converts to the v3 API format with a lowercased family", () => {
    expect(versionParamToApi("English|The_JPS_Tanakh")).toBe("english|The JPS Tanakh");
  });
  it("rejects malformed params", () => {
    expect(versionParamToApi("english")).toBeUndefined();
    expect(versionParamToApi("|Title")).toBeUndefined();
    expect(versionParamToApi(undefined)).toBeUndefined();
  });
  it("vhe is the primary and ven the translation", () => {
    expect(versionSelectionFromSearch({ vhe: "hebrew|A_B", ven: "english|C_D" })).toEqual({ primary: "hebrew|A B", translation: "english|C D" });
  });
});

describe("applySearchToSettings", () => {
  it("lets the URL override stored language and aliyot", () => {
    const s = applySearchToSettings(DEFAULT_SETTINGS, { lang: "he", aliyot: 1 });
    expect(s.language).toBe("hebrew");
    expect(s.aliyotTorah).toBe(true);
  });
  it("leaves stored settings alone when the URL is silent", () => {
    expect(applySearchToSettings({ ...DEFAULT_SETTINGS, language: "english" }, {})).toMatchObject({ language: "english", aliyotTorah: false });
  });
});

describe("carrySearch", () => {
  it("keeps display state, not the sidebar view", () => {
    expect(carrySearch({ lang: "en", aliyot: 1, with: "all" })).toBe("&lang=en&aliyot=1");
  });
  it("is empty when there is nothing to carry", () => expect(carrySearch({ with: "all" })).toBe(""));
  it("keeps version choices with their pipe", () => {
    expect(carrySearch({ ven: "english|The_JPS" })).toBe("&ven=english|The_JPS");
  });
});
