import { describe, expect, it } from "vitest";
import { ServerInputError } from "./input";
import { parseSegmentHistoryPath, validateSegmentHistoryInput } from "~/lib/activity/segment-history";
import { validateProfileSlug } from "~/features/calendars/textual-custom";
import { validateStaticPageInput } from "~/lib/static-page/load";
import { validateTopicPageInput } from "~/lib/topics/topic-page-source";
import { categoryPathOf, validateAzSliceInput, validateTopicTocSlug } from "~/lib/topics/toc-source";
import { validateTranslationSlug } from "~/lib/translations/translations-page";

const ORIGIN = "http://api.internal";

describe("readSegmentHistory's input", () => {
  const ok = { ref: "Genesis.1.1", lang: "en", version: "The_Koren_Jerusalem_Bible", page: 1 };
  it("passes the history page's own address", () => {
    expect(validateSegmentHistoryInput(ok)).toEqual(ok);
    expect(validateSegmentHistoryInput({ ...ok, lang: "he", page: 100, type: "edit_text" })).toEqual({ ...ok, lang: "he", page: 100, type: "edit_text" });
    expect(validateSegmentHistoryInput({ ...ok, type: "" })).toEqual(ok);
  });
  it("refuses a ref that climbs out of /api/activity (the URL parser would resolve it to another Django path)", () => {
    // what the old code built: each segment encoded, the dots kept, so the request went to /x/y/... with the reader's cookie
    const old = `/api/activity/${"../../x/y".split("/").map(encodeURIComponent).join("/")}/en/v?page=1`;
    expect(new URL(old, ORIGIN).pathname).toBe("/x/y/en/v");
    for (const ref of ["../../x/y", "Genesis/../../../admin", "..", ".", "a//b", "a\\..\\b"]) {
      expect(() => validateSegmentHistoryInput({ ...ok, ref }), ref).toThrow(ServerInputError);
    }
  });
  it("refuses a lone surrogate in the ref or version (a 400, not encodeURIComponent's 500)", () => {
    expect(() => validateSegmentHistoryInput({ ...ok, ref: "\ud800" })).toThrow(ServerInputError);
    expect(() => validateSegmentHistoryInput({ ...ok, version: "v\udc00" })).toThrow(ServerInputError);
  });
  it("refuses a version that is a dot segment or holds a slash", () => {
    for (const version of ["..", ".", "a/b", "", "v\u0000"]) expect(() => validateSegmentHistoryInput({ ...ok, version }), version).toThrow(ServerInputError);
  });
  it("refuses any other language, page or filter, and a non-object", () => {
    for (const bad of [{ ...ok, lang: "de" }, { ...ok, lang: ".." }, { ...ok, page: 0 }, { ...ok, page: 101 }, { ...ok, page: "1" }, { ...ok, type: "../x" }, { ...ok, type: "Edit Text" }, { ...ok, ref: 7 }, null, "Genesis.1.1"]) {
      expect(() => validateSegmentHistoryInput(bad)).toThrow(ServerInputError);
    }
  });
  it("the address parser hands what the server function refuses to Django (a 404 here), never an error", () => {
    expect(parseSegmentHistoryPath("../../x/en/v")).toBeNull();
    expect(parseSegmentHistoryPath("Genesis.1.1/de/v")).toBeNull();
    expect(parseSegmentHistoryPath("Genesis.1.1/en/v/101")).toBeNull();
    expect(parseSegmentHistoryPath("Genesis.1.1/en/../2")).toBeNull();
    expect(parseSegmentHistoryPath("Genesis.1.1/en/v/100")).toEqual({ ref: "Genesis.1.1", lang: "en", version: "v", page: 100 });
  });
});

describe("the other server functions' inputs", () => {
  it("getCustomOnServer: one profile slug segment, or none", () => {
    expect(validateProfileSlug("some-reader")).toBe("some-reader");
    expect(validateProfileSlug("")).toBe("");
    // /api/profile/.. is /api/ once parsed
    expect(new URL(`/api/profile/${encodeURIComponent("..")}`, ORIGIN).pathname).toBe("/api/");
    for (const bad of ["..", ".", "a/b", "x".repeat(201), 3, null, { slug: "a" }]) expect(() => validateProfileSlug(bad)).toThrow(ServerInputError);
  });
  it("loadStaticPage: a page of the list and en/he", () => {
    expect(validateStaticPageInput({ page: "about", lang: "he" })).toEqual({ page: "about", lang: "he" });
    for (const bad of [{ page: "../admin", lang: "en" }, { page: "__proto__", lang: "en" }, { page: "about", lang: "fr" }, { page: "about" }, null]) {
      expect(() => validateStaticPageInput(bad)).toThrow(ServerInputError);
    }
  });
  it("readTopicPage: a slug segment and en/he", () => {
    expect(validateTopicPageInput({ slug: "רג-(ambiguous)", lang: "he" })).toEqual({ slug: "רג-(ambiguous)", lang: "he" });
    for (const bad of [{ slug: "..", lang: "en" }, { slug: "a/b", lang: "en" }, { slug: "", lang: "en" }, { slug: "moses", lang: "de" }, { slug: "x".repeat(201), lang: "en" }, "moses"]) {
      expect(() => validateTopicPageInput(bad)).toThrow(ServerInputError);
    }
  });
  it("readTopicTocPage: the top level or a category slug", () => {
    expect(validateTopicTocSlug("")).toBe("");
    expect(validateTopicTocSlug("prayer")).toBe("prayer");
    expect(validateTopicTocSlug("__proto__")).toBe("__proto__"); // looked up with Object.hasOwn, never as an inherited key
    for (const bad of ["..", "a/b", 5, null, "x".repeat(201)]) expect(() => validateTopicTocSlug(bad)).toThrow(ServerInputError);
  });
  it("the TOC's category paths are looked up as own keys only (\"__proto__\" was Object.prototype, then a 500 on .map)", () => {
    const paths = { shabbat: [{ slug: "jewish-calendar2", en: "Jewish Calendar", he: "מועדי השנה" }] };
    expect(categoryPathOf(paths, "shabbat")?.[0]?.slug).toBe("jewish-calendar2");
    for (const k of ["__proto__", "constructor", "toString", "missing"]) expect(categoryPathOf(paths, k), k).toBeUndefined();
  });
  it("readAzSlice: a short letter and en/he", () => {
    expect(validateAzSliceInput({ letter: "a", lang: "en" })).toEqual({ letter: "a", lang: "en" });
    for (const bad of [{ letter: "x".repeat(21), lang: "en" }, { letter: "a", lang: "xx" }, { letter: 1, lang: "en" }, { letter: "a\u0000", lang: "en" }, null]) {
      expect(() => validateAzSliceInput(bad)).toThrow(ServerInputError);
    }
  });
  it("loadOnServer (translations): a known language only", () => {
    expect(() => validateTranslationSlug("../x")).toThrow();
  });
});
