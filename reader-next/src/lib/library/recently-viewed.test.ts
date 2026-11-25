import { describe, expect, it } from "vitest";
import { pickRecentlyViewed } from "./recently-viewed";

// the old filterRecentlyViewedItems (static/js/NavSidebar.jsx); VERIFIED on sefaria.org 2026-11-10 with the same six items
describe("Recently Viewed's items", () => {
  it("the newest item of each of the first three books, sheets left out", () => {
    const items = [
      { ref: "Genesis 1:3", book: "Genesis" },
      { ref: "Genesis 2", book: "Genesis" },
      { ref: "Sheet 1", book: "Sheet" },
      { ref: "Berakhot 2a", book: "Berakhot" },
      { ref: "Exodus 3", book: "Exodus" },
      { ref: "Psalms 23", book: "Psalms" },
    ];
    expect(pickRecentlyViewed(items).map((x) => x.ref)).toEqual(["Genesis 1:3", "Berakhot 2a", "Exodus 3"]);
    expect(pickRecentlyViewed([])).toEqual([]);
  });
});
