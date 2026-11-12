import { describe, expect, it } from "vitest";
import { diff, fold, isEmptyChange } from "./diff";
import { cloneJson, isJsonSafe, jsonEqual } from "./json";
import type { ReaderSnapshot } from "./types";

const snap = (over: Partial<ReaderSnapshot> = {}): ReaderSnapshot => ({ v: 1, url: "/Genesis.1", nav: { nav: "go" }, slices: {}, ...over });

describe("diff", () => {
  it("is empty for equal snapshots, whatever the key order", () => {
    const a = snap({ slices: { s: { v: 1, value: { a: 1, b: [1, 2] } } } });
    const b = snap({ slices: { s: { v: 1, value: { b: [1, 2], a: 1 } } } });
    expect(isEmptyChange(diff(a, b))).toBe(true);
  });

  it("names what changed: url, nav, slices added, changed and removed (null)", () => {
    const a = snap({ slices: { keep: { v: 1, value: 1 }, gone: { v: 1, value: 2 }, bump: { v: 1, value: 3 } } });
    const b = snap({
      url: "/Exodus.2",
      nav: { nav: "stay" },
      slices: { keep: { v: 1, value: 1 }, bump: { v: 2, value: 3 }, fresh: { v: 1, value: "x" } },
    });
    expect(diff(a, b)).toEqual({
      url: "/Exodus.2",
      nav: { nav: "stay" },
      slices: { gone: null, bump: { v: 2, value: 3 }, fresh: { v: 1, value: "x" } },
    });
  });

  it("fold(a, diff(a, b)) equals b", () => {
    const a = snap({ slices: { x: { v: 1, value: [1] }, y: { v: 1, value: null } } });
    const b = snap({ url: "/Exodus.1", nav: null, slices: { x: { v: 1, value: [1, 2] }, z: { v: 3, value: { q: true } } } });
    expect(fold(a, diff(a, b))).toEqual(b);
  });
});

describe("fold", () => {
  it("does not mutate its inputs", () => {
    const a = snap({ slices: { x: { v: 1, value: 1 } } });
    const before = structuredClone(a);
    fold(a, { url: "/Exodus.1", slices: { x: null, y: { v: 1, value: 2 } } });
    expect(a).toEqual(before);
  });

  it("keeps nav when the change has none, and takes nav when it has one (even null)", () => {
    expect(fold(snap(), { url: "/Exodus.1" }).nav).toEqual({ nav: "go" });
    expect(fold(snap(), { nav: null }).nav).toBeNull();
  });

  it("never writes __proto__, constructor or prototype slice keys", () => {
    const change = JSON.parse('{"slices":{"__proto__":{"v":1,"value":{"polluted":true}},"constructor":{"v":1,"value":1},"prototype":{"v":1,"value":1},"ok":{"v":1,"value":1}}}');
    const out = fold(snap(), change);
    expect(Object.keys(out.slices)).toEqual(["ok"]);
    expect(Object.getPrototypeOf(out.slices)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("json helpers", () => {
  it("isJsonSafe refuses non-JSON and prototype keys at any depth", () => {
    expect(isJsonSafe({ a: [1, "x", null, { b: true }] })).toBe(true);
    expect(isJsonSafe({ a: NaN })).toBe(false);
    expect(isJsonSafe({ a: new Date() })).toBe(false);
    expect(isJsonSafe({ a: () => 1 })).toBe(false);
    expect(isJsonSafe(JSON.parse('{"a":{"b":{"__proto__":{"x":1}}}}'))).toBe(false);
    expect(isJsonSafe({ a: { constructor: 1 } })).toBe(false);
    let deep: unknown = 1;
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(isJsonSafe(deep)).toBe(false);
  });

  it("cloneJson detaches and drops prototype keys", () => {
    const live = { a: [1, 2] };
    const copy = cloneJson(live);
    live.a.push(3);
    expect(copy).toEqual({ a: [1, 2] });
    expect(Object.keys(cloneJson(JSON.parse('{"__proto__":{"x":1},"y":2}')))).toEqual(["y"]);
  });

  it("jsonEqual treats undefined properties as absent", () => {
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(jsonEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(jsonEqual({ a: [1] }, { a: { 0: 1 } })).toBe(false);
  });
});
