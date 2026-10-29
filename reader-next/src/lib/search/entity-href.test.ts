import { describe, expect, it } from "vitest";
import { entityHref, type EntityHit } from "./entity-search";

// master #3790: a book's link is its own title, encoded; the last segment of its category path cut a title holding "/"
describe("entityHref for a book", () => {
  it("links the book's title as one path segment", () => {
    expect(entityHref("book", { title_en: "Siddur Rashi", path: "Liturgy/Siddur Rashi" } as EntityHit)).toBe("/Siddur_Rashi");
    expect(entityHref("book", { title_en: "Book/Part\\Object", path: "Cat/Book/Part\\Object" } as EntityHit)).toBe("/Book%2FPart%5CObject");
  });
});
