// @feature USL-010 @feature USL-011 @feature USL-001
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReaderHistory, useSaved, type PanelPlace } from "./use-reader-history";

const viewer = { id: 7, name: "Test Reader" };
const place = (ref: string): PanelPlace => ({ ref, versions: { en: null, he: null }, book: "Genesis", language: "bilingual" });
let posts: { url: string; items: { ref: string; action?: string }[] }[];
let savedList: unknown[];

beforeEach(() => {
  posts = [];
  savedList = [];
  document.cookie = "csrftoken=tok; path=/";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const items = JSON.parse(new URLSearchParams(String(init.body)).get("user_history")!);
      posts.push({ url: String(url), items });
      return new Response(JSON.stringify({ created: items.map((i: { ref: string; action?: string }) => ({ ref: i.ref, versions: {}, saved: i.action === "add_saved" })) }), { status: 200 });
    }
    return new Response(JSON.stringify(savedList), { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const wrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("reading history (saveLastPlace)", () => {
  it("records at once when the panel opens; a new place only after 3 s on it; the sidebar opening at once", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ p, side }) => useReaderHistory(viewer, p, side), { initialProps: { p: place("Genesis 1"), side: false } });
    await vi.waitFor(() => expect(posts.map((x) => x.items[0]!.ref)).toEqual(["Genesis 1"]));
    rerender({ p: place("Genesis 2"), side: false });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ p: place("Genesis 3"), side: false }); // moved on before 3 s: Genesis 2 is not recorded
    await act(() => vi.advanceTimersByTimeAsync(3100));
    expect(posts.map((x) => x.items[0]!.ref)).toEqual(["Genesis 1", "Genesis 3"]);
    rerender({ p: place("Genesis 3:4"), side: true }); // a verse chosen, the sidebar opens
    await vi.waitFor(() => expect(posts.map((x) => x.items[0]!.ref)).toEqual(["Genesis 1", "Genesis 3", "Genesis 3:4"]));
    expect(posts[0]!.url).toMatch(/no_return=1&annotate=1/);
  });

  it("signed out: nothing is sent; the place goes to the user_history cookie", async () => {
    renderHook(() => useReaderHistory(null, place("Exodus 1"), false));
    expect(posts).toEqual([]);
    expect(decodeURIComponent(document.cookie)).toContain('"ref":"Exodus 1"');
  });
});

describe("Save (toggleSavedItem)", () => {
  it("shows the saved state from the reader's saved items, and toggles it on the server", async () => {
    savedList = [{ ref: "Genesis 1", versions: {}, saved: true }];
    const { result, rerender } = renderHook(({ p }) => useSaved(viewer, p, () => undefined), { wrapper: wrapper(), initialProps: { p: place("Genesis 1") } });
    await waitFor(() => expect(result.current.isSaved).toBe(true));
    act(() => result.current.click());
    await waitFor(() => expect(result.current.isSaved).toBe(false));
    expect(posts.at(-1)!.items[0]).toMatchObject({ ref: "Genesis 1", action: "delete_saved" });
    rerender({ p: place("Genesis 2") });
    act(() => result.current.click());
    await waitFor(() => expect(result.current.isSaved).toBe(true));
    expect(posts.at(-1)!.items[0]).toMatchObject({ ref: "Genesis 2", action: "add_saved" });
  });

  it("signed out: a click asks to sign up, nothing is sent", async () => {
    const asked = vi.fn();
    const { result } = renderHook(() => useSaved(null, place("Genesis 1"), asked), { wrapper: wrapper() });
    act(() => result.current.click());
    expect(asked).toHaveBeenCalled();
    expect(posts).toEqual([]);
  });
});
