import { describe, expect, it } from "vitest";
import { isRangedRef, isSplatOf, parseHumanRef, parseSectionString, parseUrlRef, refToUrl, urlToRef } from "./url";

// @feature RTE-027 @feature TXD-014
describe("refToUrl / urlToRef", () => {
  it.each([
    ["Genesis 1:1", "Genesis.1.1"],
    ["Genesis 1", "Genesis.1"],
    ["Genesis", "Genesis"],
    ["Genesis 1:1-5", "Genesis.1.1-5"],
    ["Genesis 1:1-2:3", "Genesis.1.1-2.3"],
    ["Mishnah Berakhot 2:3", "Mishnah_Berakhot.2.3"],
    ["Berakhot 2a", "Berakhot.2a"],
    ["Berakhot 2a:3-5", "Berakhot.2a.3-5"],
    ["Berakhot 2a-3b", "Berakhot.2a-3b"],
    ["Rashi on Genesis 1:1:1", "Rashi_on_Genesis.1.1.1"],
    ["Jerusalem Talmud Berakhot 1:1:1", "Jerusalem_Talmud_Berakhot.1.1.1"],
    ["Pesach Haggadah, Kadesh", "Pesach_Haggadah,_Kadesh"],
    ["Pesach Haggadah, Magid, Ha Lachma Anya 1", "Pesach_Haggadah,_Magid,_Ha_Lachma_Anya.1"],
    ["Shulchan Arukh, Orach Chayim 1:1", "Shulchan_Arukh,_Orach_Chayim.1.1"],
  ])("%s ⇄ %s", (human, url) => {
    expect(refToUrl(human)).toBe(url);
    expect(urlToRef(url)).toBe(human);
  });

  it("encodes question marks like the server", () => {
    expect(refToUrl("What? 1")).toBe("What%3F.1");
  });

  it("decodes percent-encoded URL segments", () => {
    expect(urlToRef("Jastrow,_%D7%90_I")).toBe("Jastrow, א I");
  });

  it("tolerates leading/trailing slashes", () => {
    expect(urlToRef("/Genesis.1.1/")).toBe("Genesis 1:1");
  });

  it("accepts colon-form URLs", () => {
    expect(urlToRef("Genesis.1:1")).toBe("Genesis 1:1");
  });
});

describe("parseSectionString", () => {
  it("fills range ends from the left", () => {
    expect(parseSectionString("1:3-5")).toEqual({ sections: ["1", "3"], toSections: ["1", "5"] });
    expect(parseSectionString("1:3-2:4")).toEqual({ sections: ["1", "3"], toSections: ["2", "4"] });
  });
});

describe("parseUrlRef / parseHumanRef", () => {
  it("splits the title from daf sections", () => {
    expect(parseUrlRef("Berakhot.2a.3")).toEqual({ title: "Berakhot", sections: ["2a", "3"], toSections: ["2a", "3"] });
  });
  it("treats a bare complex node as title only", () => {
    expect(parseHumanRef("Siddur Ashkenaz, Weekday, Shacharit")).toEqual({
      title: "Siddur Ashkenaz, Weekday, Shacharit",
      sections: [],
      toSections: [],
    });
  });
});

describe("isRangedRef", () => {
  it("detects ranges", () => {
    expect(isRangedRef("Genesis 1:1-5")).toBe(true);
    expect(isRangedRef("Genesis 1:1")).toBe(false);
    expect(isRangedRef("Genesis 1:1-1")).toBe(false);
  });
});

// master #3790: titles may hold "/" and "\\"; a title is raw text, so "%" is escaped too (master's titleUrl.test.js cases)
describe("titles with URL separators", () => {
  it("encodes them as one path segment", () => {
    expect(refToUrl("Book/Part\\Object")).toBe("Book%2FPart%5CObject");
    expect(refToUrl("Book/Part\\Object?Edition%2F")).toBe("Book%2FPart%5CObject%3FEdition%252F");
    expect(refToUrl("Book/Part\\Object 1:2")).toBe("Book%2FPart%5CObject.1.2");
  });
  it("round-trips", () => {
    expect(urlToRef(refToUrl("Book/Part\\Object 1:2"))).toBe("Book/Part\\Object 1:2");
    expect(urlToRef("Book%2FPart%5CObject")).toBe("Book/Part\\Object");
  });
});

describe("isSplatOf (the router's decoded splat vs a URL ref)", () => {
  it("matches titles whose URL form is escaped", () => {
    expect(isSplatOf("Book/Part\\Object.1", "Book%2FPart%5CObject.1")).toBe(true);
    expect(isSplatOf("What?.1", "What%3F.1")).toBe(true);
    expect(isSplatOf("Genesis.1/", "Genesis.1")).toBe(true);
    expect(isSplatOf("Gen.1", "Genesis.1")).toBe(false);
  });
});
