import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  addBookmark,
  compareRefs,
  moveBookmark,
  noteReading,
  parseState,
  removeBookmark,
  resetFurthest,
  setBookmarkMode,
  setDefaultMode,
  setLayout,
  sortedBookmarks,
  type BookmarkState,
} from "./model";

const manual = setDefaultMode(EMPTY_STATE, "manual");

describe("compareRefs", () => {
  it("orders verses numerically, not as strings", () => {
    expect(compareRefs("Genesis 2:1", "Genesis 10:1")).toBeLessThan(0);
    expect(compareRefs("Genesis 1:10", "Genesis 1:9")).toBeGreaterThan(0);
    expect(compareRefs("Genesis 1:3", "Genesis 1:3")).toBe(0);
  });
  it("orders daf sides after their daf", () => {
    expect(compareRefs("Berakhot 2a:5", "Berakhot 2b:1")).toBeLessThan(0);
    expect(compareRefs("Berakhot 3a:1", "Berakhot 2b:9")).toBeGreaterThan(0);
  });
  it("can't compare different nodes of a complex text", () => {
    expect(compareRefs("Pesach Haggadah, Kadesh 1", "Pesach Haggadah, Magid 1")).toBeUndefined();
    expect(compareRefs("Pesach Haggadah, Kadesh", "Pesach Haggadah, Kadesh")).toBeUndefined();
  });
});

describe("adding and removing", () => {
  it("adds a bookmark in the default mode, one per book", () => {
    let s = addBookmark(EMPTY_STATE, "Genesis", "Genesis 1:1", 1);
    expect(s.books.Genesis).toEqual({ book: "Genesis", ref: "Genesis 1:1", mode: "auto", updated: 1, furthest: "Genesis 1:1" });
    s = addBookmark(s, "Genesis", "Genesis 3:4", 2);
    expect(Object.keys(s.books)).toEqual(["Genesis"]);
    expect(s.books.Genesis!.ref).toBe("Genesis 3:4");
    expect(addBookmark(manual, "Berakhot", "Berakhot 2a:1", 1).books.Berakhot).toEqual({ book: "Berakhot", ref: "Berakhot 2a:1", mode: "manual", updated: 1 });
  });
  it("removes a bookmark, and removing a missing one changes nothing", () => {
    const s = addBookmark(EMPTY_STATE, "Genesis", "Genesis 1:1", 1);
    expect(removeBookmark(s, "Genesis").books).toEqual({});
    expect(removeBookmark(s, "Exodus")).toBe(s);
  });
});

describe("moving", () => {
  it("moves a manual bookmark only when asked", () => {
    let s = addBookmark(manual, "Genesis", "Genesis 1:1", 1);
    s = noteReading(s, "Genesis", "Genesis 5:1", 2);
    expect(s.books.Genesis!.ref).toBe("Genesis 1:1");
    s = moveBookmark(s, "Genesis", "Genesis 5:1", 3);
    expect(s.books.Genesis).toMatchObject({ ref: "Genesis 5:1", updated: 3 });
    expect(s.books.Genesis!.furthest).toBeUndefined();
  });
  it("moving where there is no bookmark adds one", () => {
    expect(moveBookmark(EMPTY_STATE, "Genesis", "Genesis 2:2", 1).books.Genesis!.ref).toBe("Genesis 2:2");
  });
  it("reading a book without a bookmark adds nothing", () => {
    expect(noteReading(EMPTY_STATE, "Genesis", "Genesis 1:1", 1)).toBe(EMPTY_STATE);
  });
});

describe("auto mode", () => {
  it("follows the reader, and the furthest point only moves forward", () => {
    let s = addBookmark(EMPTY_STATE, "Genesis", "Genesis 1:1", 1);
    s = noteReading(s, "Genesis", "Genesis 4:2", 2);
    expect(s.books.Genesis).toMatchObject({ ref: "Genesis 4:2", furthest: "Genesis 4:2", updated: 2 });
    s = noteReading(s, "Genesis", "Genesis 2:1", 3);
    expect(s.books.Genesis).toMatchObject({ ref: "Genesis 2:1", furthest: "Genesis 4:2", updated: 3 });
  });
  it("noting the same segment again is a no-op", () => {
    const s = noteReading(addBookmark(EMPTY_STATE, "Genesis", "Genesis 1:1", 1), "Genesis", "Genesis 1:2", 2);
    expect(noteReading(s, "Genesis", "Genesis 1:2", 3)).toBe(s);
  });
  it("resets the furthest point to the bookmark", () => {
    let s = addBookmark(EMPTY_STATE, "Genesis", "Genesis 1:1", 1);
    s = noteReading(s, "Genesis", "Genesis 9:1", 2);
    s = noteReading(s, "Genesis", "Genesis 3:1", 3);
    expect(resetFurthest(s, "Genesis").books.Genesis!.furthest).toBe("Genesis 3:1");
  });
  it("switches modes per bookmark", () => {
    let s = addBookmark(EMPTY_STATE, "Genesis", "Genesis 1:1", 1);
    s = setBookmarkMode(s, "Genesis", "manual", 2);
    expect(s.books.Genesis).toEqual({ book: "Genesis", ref: "Genesis 1:1", mode: "manual", updated: 2 });
    s = setBookmarkMode(s, "Genesis", "auto", 3);
    expect(s.books.Genesis).toMatchObject({ mode: "auto", furthest: "Genesis 1:1" });
    expect(setBookmarkMode(s, "Genesis", "auto", 4)).toBe(s);
  });
});

describe("saving a layout", () => {
  const layout = { search: { lang: "bi", p2: "Rashi_on_Berakhot.2a.1.1", lang2: "he" } };
  it("snapshots on create, and is replaced only by saving", () => {
    let s = addBookmark(EMPTY_STATE, "Berakhot", "Berakhot 2a:1", 1, layout);
    expect(s.books.Berakhot!.layout).toEqual(layout);
    s = addBookmark(s, "Berakhot", "Berakhot 4a:1", 2);
    expect(s.books.Berakhot!.layout).toEqual(layout);
    s = setLayout(s, "Berakhot", { search: { lang: "he" } }, 5);
    expect(s.books.Berakhot).toMatchObject({ layout: { search: { lang: "he" } }, ref: "Berakhot 4a:1", updated: 5 });
    expect(setLayout(s, "Berakhot", { search: { lang: "he" } }, 6)).toBe(s);
    expect(setLayout(s, "Shabbat", layout, 6)).toBe(s);
    expect(parseState(JSON.stringify(s))).toEqual(s);
  });
});

describe("storage", () => {
  it("round-trips and drops malformed entries", () => {
    const s = addBookmark(manual, "Genesis", "Genesis 1:1", 5);
    expect(parseState(JSON.stringify(s))).toEqual(s);
    expect(parseState('{"books":{"X":{"mode":"auto"},"Y":{"ref":"Y 1","mode":"weird"}}}')).toEqual({
      version: 1,
      defaultMode: "auto",
      books: { Y: { book: "Y", ref: "Y 1", mode: "auto", updated: 0 } },
    });
    expect(parseState("not json")).toEqual(EMPTY_STATE);
    expect(parseState(null)).toEqual(EMPTY_STATE);
  });
  it("keeps a valid layout and drops a malformed one", () => {
    const raw = { version: 1, books: { A: { ref: "A 1", mode: "auto", updated: 1, layout: { search: { layout: "r(1,2)", p2: "Rashi 1" } } }, B: { ref: "B 1", mode: "auto", updated: 1, layout: { search: { x: 3 } } } } };
    const s = parseState(JSON.stringify(raw));
    expect(s.books.A!.layout).toEqual({ search: { layout: "r(1,2)", p2: "Rashi 1" } });
    expect(s.books.B!.layout).toBeUndefined();
  });
  it("lists the most recently changed first", () => {
    let s = addBookmark(EMPTY_STATE, "Genesis", "Genesis 1:1", 1);
    s = addBookmark(s, "Exodus", "Exodus 1:1", 2);
    expect(sortedBookmarks(s).map((b) => b.book)).toEqual(["Exodus", "Genesis"]);
  });
});

describe("layout", () => {
  const layout = { search: { layout: "r(c(1,2)~33,3~67)", p2: "Rashi on Berakhot 2a" } };
  it("survives moves, reading, mode changes, re-adding and furthest resets", () => {
    const base = addBookmark(EMPTY_STATE, "Berakhot", "Berakhot 2a:1", 1);
    let s: BookmarkState = { ...base, books: { Berakhot: { ...base.books.Berakhot!, layout } } };
    s = noteReading(s, "Berakhot", "Berakhot 3a:1", 2);
    s = noteReading(s, "Berakhot", "Berakhot 2b:1", 3);
    s = resetFurthest(s, "Berakhot");
    s = setBookmarkMode(s, "Berakhot", "manual", 4);
    s = moveBookmark(s, "Berakhot", "Berakhot 5a:1", 5);
    s = addBookmark(s, "Berakhot", "Berakhot 6a:1", 6);
    s = setBookmarkMode(s, "Berakhot", "auto", 7);
    expect(s.books.Berakhot!.layout).toEqual(layout);
    expect(parseState(JSON.stringify(s)).books.Berakhot!.layout).toEqual(layout);
  });
});
