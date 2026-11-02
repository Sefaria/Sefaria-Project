import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { addBookmark, noteReading, removeBookmark, resetBookmarkStoreForTests, setBookmarkMode, useBookmark, useBookmarks } from "./store";

beforeEach(() => {
  localStorage.clear();
  resetBookmarkStoreForTests();
});

describe("bookmark store", () => {
  it("persists to localStorage and re-renders subscribers", () => {
    const { result } = renderHook(() => useBookmark("Genesis"));
    expect(result.current).toBeUndefined();
    act(() => addBookmark("Genesis", "Genesis 1:1"));
    expect(result.current).toMatchObject({ ref: "Genesis 1:1", mode: "auto" });
    act(() => noteReading("Genesis", "Genesis 2:3"));
    expect(result.current).toMatchObject({ ref: "Genesis 2:3", furthest: "Genesis 2:3" });
    expect(JSON.parse(localStorage.getItem("sefaria-reader:bookmarks")!).books.Genesis.ref).toBe("Genesis 2:3");
  });

  it("reads what an earlier visit stored", () => {
    localStorage.setItem("sefaria-reader:bookmarks", JSON.stringify({ defaultMode: "manual", books: { Berakhot: { ref: "Berakhot 2a:1", mode: "manual", updated: 1 } } }));
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.defaultMode).toBe("manual");
    expect(result.current.books.Berakhot!.ref).toBe("Berakhot 2a:1");
  });

  it("keeps the snapshot stable when nothing changed", () => {
    act(() => addBookmark("Genesis", "Genesis 1:1"));
    act(() => setBookmarkMode("Genesis", "manual"));
    const { result } = renderHook(() => useBookmarks());
    const before = result.current;
    act(() => noteReading("Genesis", "Genesis 5:5"));
    expect(result.current).toBe(before);
    act(() => removeBookmark("Genesis"));
    expect(result.current.books).toEqual({});
  });
});
