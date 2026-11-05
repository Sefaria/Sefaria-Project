import { describe, expect, it, vi } from "vitest";
import { createSliceRegistry } from "./registry";
import { fakeSlice } from "./test-utils";

describe("createSliceRegistry", () => {
  it("registers, lists, gets and unregisters, notifying each time", () => {
    const reg = createSliceRegistry();
    const cb = vi.fn();
    reg.onChange(cb);
    const a = fakeSlice("a", 1);
    const off = reg.register(a);
    expect(reg.get("a")).toBe(a);
    expect(reg.list()).toEqual([a]);
    off();
    expect(reg.get("a")).toBeUndefined();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("a replacement survives the old owner's cleanup (remount order)", () => {
    const reg = createSliceRegistry();
    const first = fakeSlice("a", 1);
    const second = fakeSlice("a", 2);
    const offFirst = reg.register(first);
    reg.register(second);
    offFirst();
    expect(reg.get("a")).toBe(second);
  });

  it("does not resolve prototype names as slices", () => {
    const reg = createSliceRegistry();
    expect(reg.get("constructor")).toBeUndefined();
    expect(reg.get("__proto__")).toBeUndefined();
  });
});
