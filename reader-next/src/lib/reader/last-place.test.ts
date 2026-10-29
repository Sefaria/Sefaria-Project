import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPlaces, lastPlace, MAX_BOOKS, rememberPlace } from "./last-place";

// CODE_REVIEW R-29: places stayed forever, unowned (the next person on a shared machine saw them), written once per verse
describe("the last place in each book", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("belongs to the reader who read it: not shown to a guest after sign-out, nor to another account", () => {
    rememberPlace("Genesis", "Genesis 12:3", 7);
    flushPlaces();
    expect(lastPlace("Genesis", 7)).toBe("Genesis 12:3");
    expect(lastPlace("Genesis", null)).toBeUndefined();
    expect(lastPlace("Genesis", 8)).toBeUndefined();
    // a new reader's place replaces the old reader's places
    rememberPlace("Exodus", "Exodus 3:1", null);
    flushPlaces();
    expect(lastPlace("Genesis", 7)).toBeUndefined();
    expect(lastPlace("Exodus", null)).toBe("Exodus 3:1");
  });

  it("is written once reading settles, not once per verse", () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    for (let v = 1; v <= 30; v++) rememberPlace("Genesis", `Genesis 1:${v}`, null);
    expect(set).not.toHaveBeenCalled();
    expect(lastPlace("Genesis", null)).toBe("Genesis 1:30"); // already answered while pending
    flushPlaces();
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("keeps the most recent books only", () => {
    for (let i = 0; i < MAX_BOOKS + 5; i++) {
      vi.spyOn(Date, "now").mockReturnValue(1000 + i);
      rememberPlace(`Book ${i}`, `Book ${i} 1`, null);
      flushPlaces();
    }
    const stored = JSON.parse(localStorage.getItem("sefaria-reader:last-place")!);
    expect(Object.keys(stored.places)).toHaveLength(MAX_BOOKS);
    expect(lastPlace("Book 0", null)).toBeUndefined();
    expect(lastPlace(`Book ${MAX_BOOKS + 4}`, null)).toBe(`Book ${MAX_BOOKS + 4} 1`);
  });

  it("drops the first version's unowned places", () => {
    localStorage.setItem("sefaria-reader:last-place", JSON.stringify({ Genesis: { ref: "Genesis 5:1", time: 1 } }));
    expect(lastPlace("Genesis", null)).toBeUndefined();
  });
});
