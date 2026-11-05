import { describe, expect, it } from "vitest";
import { addressToNumber, nextAddress, numberToAddress } from "./address";

// @feature TXT-007 @feature TXT-013
describe("address arithmetic", () => {
  it("steps through Talmud amudim", () => {
    expect(nextAddress("2a", "Talmud")).toBe("2b");
    expect(nextAddress("2b", "Talmud")).toBe("3a");
    expect(addressToNumber("2a", "Talmud")).toBe(3);
    expect(numberToAddress(3, "Talmud")).toBe("2a");
  });
  it("steps through four folio columns", () => {
    expect(nextAddress("3b", "Folio")).toBe("3c");
    expect(nextAddress("3d", "Folio")).toBe("4a");
    expect(addressToNumber("1d", "Folio")).toBe(4);
  });
  it("treats other types as integers", () => {
    expect(nextAddress("9", "Perek")).toBe("10");
    expect(nextAddress("9")).toBe("10");
  });
  it("round-trips Talmud numbering", () => {
    for (let n = 1; n < 400; n++) expect(addressToNumber(numberToAddress(n, "Talmud"), "Talmud")).toBe(n);
  });
});
