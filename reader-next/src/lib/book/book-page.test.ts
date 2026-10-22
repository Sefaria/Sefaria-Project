import { describe, expect, it } from "vitest";
import { bookTitleOf, categoryHref, primaryCategory, sameTitle } from "./book-page";

// @feature BOK-001 @feature BOK-002
describe("book page rules", () => {
  it("a ref with no section is the book itself", () => {
    expect(bookTitleOf("Genesis")).toBe("Genesis");
    expect(bookTitleOf("Rashi on Genesis")).toBe("Rashi on Genesis");
    expect(bookTitleOf("Genesis 1")).toBeUndefined();
    expect(bookTitleOf("Berakhot 2a")).toBeUndefined();
  });
  it("titles compare by spelling, not case or underscores", () => {
    expect(sameTitle("Pesach_Haggadah", "Pesach Haggadah")).toBe(true);
    expect(sameTitle("genesis", "Genesis")).toBe(true);
    expect(sameTitle("Pesach Haggadah, Kadesh", "Pesach Haggadah")).toBe(false);
  });
  it("the category label follows the old rules", () => {
    expect(categoryHref(["Tanakh", "Torah"])).toBe("https://www.sefaria.org/texts/Tanakh");
    expect(categoryHref(["Talmud", "Bavli", "Seder Zeraim"])).toBe("https://www.sefaria.org/texts/Talmud/Bavli");
    expect(categoryHref(["Tanakh", "Rishonim on Tanakh", "Rashi", "Torah"], "Commentary")).toBe("https://www.sefaria.org/texts/Tanakh/Rishonim on Tanakh");
    expect(categoryHref(["Tanakh", "Commentary", "Rashi", "Torah"], "Commentary")).toBe("https://www.sefaria.org/texts/Tanakh/Commentary");
    expect(categoryHref(["Tanakh", "Targum", "Onkelos"], "Targum")).toBe("https://www.sefaria.org/texts/Tanakh/Targum");
    expect(primaryCategory(["Tanakh", "Rishonim on Tanakh", "Rashi"], "Commentary")).toBe("Commentary");
  });
});
