import { describe, expect, it } from "vitest";
import { categoryRequest, move, validateCategory, type CategoryDraft } from "./category-editor";

const draft: CategoryDraft = { enTitle: "Torah", heTitle: "תורה", enDescription: "d", heDescription: "", enShortDescription: "s", heShortDescription: "", isPrimary: true, path: ["Tanakh"], children: ["Genesis", "Exodus"] };

// @feature LIB-002
describe("category editor (the old CategoryEditor's save)", () => {
  it("a new category posts without update or reorder", () => {
    const { url, body } = categoryRequest({ enTitle: "", path: ["Tanakh"], children: [] }, { ...draft, children: [] });
    expect(url).toBe("/api/category/Tanakh/Torah");
    expect(body).toEqual({ isPrimary: true, enDesc: "d", heDesc: "", enShortDesc: "s", heShortDesc: "", heSharedTitle: "תורה", sharedTitle: "Torah", path: ["Tanakh", "Torah"] });
  });

  it("an existing one updates with its old path, and reorders only when the children moved", () => {
    const orig = { enTitle: "Torah", path: ["Tanakh"], children: ["Genesis", "Exodus"] };
    expect(categoryRequest(orig, draft).url).toBe("/api/category/Tanakh/Torah?update=1");
    const moved = categoryRequest(orig, { ...draft, enTitle: "Pentateuch", children: ["Exodus", "Genesis"] });
    expect(moved.url).toBe("/api/category/Tanakh/Pentateuch?update=1&reorder=1");
    expect(moved.body).toMatchObject({ origPath: ["Tanakh", "Torah"], subcategoriesAndBooks: ["Exodus", "Genesis"] });
  });

  it("validates and moves", () => {
    expect(validateCategory(draft, false)).toBe("Please change one of the fields before saving.");
    expect(validateCategory({ ...draft, enTitle: "" }, true)).toBe("Title must be provided.");
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
