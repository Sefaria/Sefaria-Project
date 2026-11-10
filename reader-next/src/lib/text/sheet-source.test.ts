import { describe, expect, it } from "vitest";
import { anyFullImage, refsHaveImage } from "./sheet-source";

// @feature CON-056 The image guard (old checkContentForImages)
describe("Add to Sheet: images", () => {
  const IMG = '<img src="https://textimages.sefaria.org/a.png" alt="x">';
  it("a verse that is only an image blocks the add; an inline image does not", () => {
    expect(anyFullImage(["text", IMG])).toBe(true);
    expect(anyFullImage([`text ${IMG}`, undefined])).toBe(false);
  });
  it("checks the chosen verses of the section, either side", () => {
    const section = { segments: [{ ref: "Genesis 1:1", primary: "בראשית", translation: IMG }, { ref: "Genesis 1:2", primary: "והארץ", translation: "Now" }] } as never;
    expect(refsHaveImage(section, ["Genesis 1:1"])).toBe(true);
    expect(refsHaveImage(section, ["Genesis 1:2"])).toBe(false);
    expect(refsHaveImage(undefined, ["Genesis 1:2"])).toBe(false);
  });
});
