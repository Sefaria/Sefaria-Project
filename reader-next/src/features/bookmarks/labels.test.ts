import { describe, expect, it } from "vitest";
import { hebrewPlace, placeOf, relativeDay } from "./labels";

describe("bookmark labels", () => {
  it("takes the book's name off the ref", () => {
    expect(placeOf({ book: "Genesis", ref: "Genesis 12:4" })).toBe("12:4");
    expect(placeOf({ book: "Mishneh Torah, Foundations of the Torah", ref: "Mishneh Torah, Foundations of the Torah 1:7" })).toBe("1:7");
    expect(placeOf({ book: "Genesis", ref: "Exodus 1:1" })).toBe("Exodus 1:1");
  });

  it("writes chapters, verses and dafs in Hebrew numerals", () => {
    expect(hebrewPlace("12:4")).toBe("י״ב:ד׳");
    expect(hebrewPlace("5a:2")).toBe("ה. ב׳");
  });

  it("says when, in days, weeks, months or years", () => {
    const now = Date.UTC(2026, 9, 25);
    const day = 86_400_000;
    expect(relativeDay(now - 1000, now, "en")).toBe("today");
    expect(relativeDay(now - 2 * day, now, "en")).toBe("2 days ago");
    expect(relativeDay(now - 20 * day, now, "en")).toBe("2 weeks ago");
    expect(relativeDay(now - 400 * day, now, "en")).toBe("last year");
  });
});
