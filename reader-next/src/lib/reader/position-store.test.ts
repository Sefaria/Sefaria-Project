import { describe, expect, it, vi } from "vitest";
import { PositionStore } from "./position-store";

const fakeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

// @feature SHL-065 @feature SHL-064
describe("PositionStore", () => {
  it("remembers positions per entry and panel", () => {
    const s = new PositionStore();
    s.set("a", { p1: { ref: "Genesis 1:8", offset: 140 }, p2: { ref: "Exodus 1:1", offset: 90 } });
    expect(s.get("a")?.p2).toEqual({ ref: "Exodus 1:1", offset: 90 });
    expect(s.get("b")).toBeUndefined();
    expect(s.get(undefined)).toBeUndefined();
  });

  it("ignores empty saves (a page with no column must not erase a saved place)", () => {
    const s = new PositionStore();
    s.set("a", { p1: { ref: "Genesis 1:8", offset: 140 } });
    s.set("a", {});
    expect(s.get("a")?.p1?.ref).toBe("Genesis 1:8");
  });

  it("keeps only the most recent entries", () => {
    const s = new PositionStore(null, 3);
    for (const k of ["a", "b", "c", "d"]) s.set(k, { p1: { ref: k, offset: 0 } });
    expect(s.get("a")).toBeUndefined();
    expect(s.get("d")).toBeDefined();
  });

  it("survives a reload through storage", () => {
    const storage = fakeStorage();
    const first = new PositionStore(storage);
    first.set("a", { p1: { ref: "Genesis 1:8", offset: 140 } });
    first.flush(); // what the page does when it goes away (pagehide), or after a quiet second
    expect(new PositionStore(storage).get("a")?.p1).toEqual({ ref: "Genesis 1:8", offset: 140 });
  });

  // CODE_REVIEW R-29: every scroll pause serialised the whole trail to storage (twice)
  it("writes to storage once things are quiet, not on every save", () => {
    vi.useFakeTimers();
    try {
      const storage = fakeStorage();
      const spy = vi.spyOn(storage, "setItem");
      const store = new PositionStore(storage);
      for (let i = 0; i < 10; i++) store.set(`k${i}`, { p1: { ref: `Genesis 1:${i + 1}`, offset: 0 } });
      expect(spy).not.toHaveBeenCalled();
      expect(store.get("k9")?.p1?.ref).toBe("Genesis 1:10"); // memory answers at once
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tolerates corrupt storage and a storage that throws", () => {
    const bad = { getItem: () => "{nope", setItem: () => { throw new Error("quota"); } };
    const s = new PositionStore(bad);
    expect(() => s.set("a", { p1: { ref: "x", offset: 1 } })).not.toThrow();
    expect(s.get("a")).toBeDefined();
  });
});
