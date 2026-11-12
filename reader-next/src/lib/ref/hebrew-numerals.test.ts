import { describe, expect, it } from "vitest";
import { decodeHebrewNumeral, encodeHebrewDaf, encodeHebrewNumeral } from "./hebrew-numerals";

// @feature TXD-065
describe("encodeHebrewNumeral", () => {
  it.each([
    [1, "א׳"],
    [10, "י׳"],
    [11, "י״א"],
    [15, "ט״ו"],
    [16, "ט״ז"],
    [20, "כ׳"],
    [115, "קט״ו"],
    [150, "ק״נ"],
    [400, "ת׳"],
    [613, "תרי״ג"],
    [916, "תתקט״ז"],
  ])("%i → %s", (n, expected) => {
    expect(encodeHebrewNumeral(n)).toBe(expected);
  });

  it("omits punctuation when asked (segment numbers)", () => {
    expect(encodeHebrewNumeral(1, { punctuation: false })).toBe("א");
    expect(encodeHebrewNumeral(176, { punctuation: false })).toBe("קעו");
  });

  it("encodes years with thousands", () => {
    expect(encodeHebrewNumeral(5786)).toBe("ה׳תשפ״ו");
  });

  it("rejects non-positive and fractional input", () => {
    expect(() => encodeHebrewNumeral(0)).toThrow(RangeError);
    expect(() => encodeHebrewNumeral(1.5)).toThrow(RangeError);
  });

  it("round-trips 1..999 through decode", () => {
    for (let n = 1; n < 1000; n++) {
      expect(decodeHebrewNumeral(encodeHebrewNumeral(n))).toBe(n);
    }
  });
});

describe("decodeHebrewNumeral", () => {
  it("handles final letters and stray punctuation", () => {
    expect(decodeHebrewNumeral("ך")).toBe(20);
    expect(decodeHebrewNumeral("ל\"ג")).toBe(33);
  });
  it("returns NaN for non-numeral text", () => {
    expect(decodeHebrewNumeral("abc")).toBeNaN();
  });
});

describe("encodeHebrewDaf", () => {
  it("marks amud a with a period and amud b with a colon", () => {
    expect(encodeHebrewDaf("2a")).toBe("ב.");
    expect(encodeHebrewDaf("2b")).toBe("ב:");
    expect(encodeHebrewDaf("64a")).toBe("סד.");
  });
  it("passes through non-daf strings", () => {
    expect(encodeHebrewDaf("12")).toBe("12");
  });
});
