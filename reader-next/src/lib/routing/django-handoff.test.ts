import { describe, expect, it } from "vitest";
import { shouldHandOffToDjango } from "./django-handoff";

describe("shouldHandOffToDjango", () => {
  it("hands an in-app navigation that reached a 404 to the server", () => {
    expect(shouldHandOffToDjango("https://www.sefaria.org/topics", "https://www.sefaria.org/topics/category/no-such")).toBe(true);
    expect(shouldHandOffToDjango("https://www.sefaria.org/topics/moses", "https://www.sefaria.org/topics/moses?editor=1")).toBe(true);
  });
  it("keeps the server's own 404 (the document's address): never reloads in a loop", () => {
    expect(shouldHandOffToDjango("https://www.sefaria.org/topics/no-such", "https://www.sefaria.org/topics/no-such")).toBe(false);
    expect(shouldHandOffToDjango("https://www.sefaria.org/topics/no-such", "https://www.sefaria.org/topics/no-such#x")).toBe(false);
  });
  it("does nothing without a document address (server render)", () => {
    expect(shouldHandOffToDjango(undefined, "https://www.sefaria.org/topics/x")).toBe(false);
  });
});
