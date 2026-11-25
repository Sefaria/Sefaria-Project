import { describe, expect, it } from "vitest";
import { bookColor, categoryColor } from "./category-color";

// @feature LIB-019 @feature GUI-013
describe("categoryColor", () => {
  it("maps known categories to their token", () => {
    expect(categoryColor("Tanakh")).toBe("var(--sefaria-cat-tanakh)");
    expect(categoryColor("Talmud")).toBe("var(--sefaria-cat-talmud)");
    expect(categoryColor("Quoting Commentary")).toBe(categoryColor("Responsa"));
    expect(categoryColor("Sheet")).toBe(categoryColor("Sheets"));
  });
  it("returns the rainbow gradient for static pages", () => {
    expect(categoryColor("Static")).toContain("linear-gradient");
  });
  it("hashes unknown categories to a stable fallback colour", () => {
    const a = categoryColor("Made-up Category");
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
    expect(categoryColor("Made-up Category")).toBe(a);
  });
  it("handles missing input", () => {
    expect(categoryColor(undefined)).toBe(categoryColor(""));
  });
});

describe("bookColor", () => {
  it("prefers primary category, then first category, then Other", () => {
    expect(bookColor({ primary_category: "Mishnah", categories: ["Tanakh"] })).toBe("var(--sefaria-cat-mishnah)");
    expect(bookColor({ categories: ["Midrash", "Aggadah"] })).toBe("var(--sefaria-cat-midrash)");
    expect(bookColor(undefined)).toBe(categoryColor("Other"));
  });
});
