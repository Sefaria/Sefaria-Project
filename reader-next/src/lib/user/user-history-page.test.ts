// @feature USL-008 @feature USL-003 @feature USL-004 @feature USL-005
import { describe, expect, it } from "vitest";
import { dedupeItems, naturalTimeShort, noteHref, passageHref, readingHistoryEnabled, userHistoryUrl, userHistoryQuery, PAGE_SIZE } from "./user-history-page";

describe("the Saved / History / Notes page's data", () => {
  it("asks for saved items or history, annotated, a page at a time", () => {
    expect(userHistoryUrl("saved", 0)).toBe("/api/profile/user_history?saved=1&sheets_only=0&secondary=0&annotate=1&skip=0&limit=20");
    expect(userHistoryUrl("history", 40)).toBe("/api/profile/user_history?saved=0&sheets_only=0&secondary=0&annotate=1&skip=40&limit=20");
  });
  it("reads the next page after what was read; a short page is the last", () => {
    const next = userHistoryQuery(1, "history").getNextPageParam!;
    const full = Array.from({ length: PAGE_SIZE }, () => ({ ref: "x" }));
    expect(next(full, [full], 0, [0])).toBe(20);
    expect(next(full, [full, full], 20, [0, 20])).toBe(40);
    expect(next([{ ref: "x" }], [full, [{ ref: "x" }]], 20, [0, 20])).toBeUndefined();
  });
  it("drops consecutive items of the same book (the old dedupeItems), not repeated ones further apart", () => {
    const items = [{ book: "Genesis", n: 1 }, { book: "Genesis", n: 2 }, { book: "Exodus", n: 3 }, { book: "Genesis", n: 4 }, { n: 5 }, { n: 6 }];
    expect(dedupeItems(items).map((i) => i.n)).toEqual([1, 3, 4, 5]);
  });
  it("history is on unless the profile's reading_history is false", () => {
    expect(readingHistoryEnabled({ settings: { reading_history: false } })).toBe(false);
    expect(readingHistoryEnabled({ settings: { reading_history: true } })).toBe(true);
    expect(readingHistoryEnabled({ settings: {} })).toBe(true);
    expect(readingHistoryEnabled(null)).toBe(true);
  });
  it("a note's citation opens the verse with Notes; a note on a sheet goes to the sheet", () => {
    expect(noteHref("Genesis 1:3")).toBe("/Genesis.1.3?with=Notes");
    expect(noteHref("Sheet 3.4")).toBe("/sheets/3.4");
  });
  it("a text keeps its versions in the address", () => {
    expect(passageHref({ ref: "Genesis 1:1" })).toBe("/Genesis.1.1");
    expect(passageHref({ ref: "Genesis 1:1", versions: { en: { versionTitle: "The Contemporary Torah, JPS 2006", languageFamilyName: "english" }, he: null } })).toBe(
      "/Genesis.1.1?ven=english|The_Contemporary_Torah%2C_JPS_2006",
    );
  });
  it("the time since in its largest unit, as the old naturalTime(…, {short: true})", () => {
    const now = 1_000_000_000;
    expect(naturalTimeShort(now - 30, "en", now)).toBe("30s");
    expect(naturalTimeShort(now - 5 * 60, "en", now)).toBe("5m");
    expect(naturalTimeShort(now - 3 * 86400, "en", now)).toBe("3d");
    expect(naturalTimeShort(now - 3 * 86400, "he", now)).toBe("3 י'");
    expect(naturalTimeShort(now - 400 * 86400, "en", now)).toBe("1y");
  });
});
