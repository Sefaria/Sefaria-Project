import { describe, expect, it } from "vitest";
import { readFixture } from "../../../test/msw/fixtures";
import { buildCatalog, type TocNode } from "~/lib/catalog/toc";
import { categoryDescription, categoryLabel } from "./terms";

const catalog = buildCatalog(readFixture<TocNode[]>("_toc/toc.json"));

// @feature CON-019
describe("category labels", () => {
  it("uses the catalog's Hebrew name for library categories", () => {
    expect(categoryLabel("Talmud", catalog)).toEqual({ en: "Talmud", he: "תלמוד" });
    expect(categoryLabel("Tanakh", catalog).he).toBe('תנ"ך'); // the catalog uses an ASCII quote
  });
  it("knows the sidebar-only categories", () => {
    expect(categoryLabel("Commentary", catalog).he).toBe("מפרשים");
    expect(categoryLabel("Targum", catalog).he).toBe("תרגומים");
  });
  it("falls back to English when there is no Hebrew term", () => {
    expect(categoryLabel("Quoting Commentary", catalog)).toEqual({ en: "Quoting Commentary", he: "Quoting Commentary" });
  });
  it("works before the catalog has loaded", () => {
    expect(categoryLabel("Commentary", undefined).he).toBe("מפרשים");
  });
});

describe("category descriptions", () => {
  it("has the two hard-coded descriptions", () => {
    expect(categoryDescription("Commentary", catalog)?.en).toMatch(/^Interpretations/);
    expect(categoryDescription("Quoting Commentary", catalog)?.en).toMatch(/^References to this source/);
  });
  it("takes library categories' descriptions from the catalog", () => {
    expect(categoryDescription("Mishnah", catalog)?.en).toBeTruthy();
  });
  it("has none for unknown categories", () => {
    expect(categoryDescription("Nonsense", catalog)).toBeUndefined();
  });
});
