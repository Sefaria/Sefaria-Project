import { describe, expect, it } from "vitest";
import { bookDescription } from "./book-route";

describe("the book page's description", () => {
  // @feature BOK-001
  it("carries the short Hebrew description for the Hebrew interface (Berakhot: no long one)", () => {
    expect(bookDescription({ enDesc: "Berakhot (Blessings) is…", heDesc: null, heShortDesc: "ברכות ותפילות" })).toEqual({ en: "Berakhot (Blessings) is…", he: null, heShort: "ברכות ותפילות" });
  });
});
