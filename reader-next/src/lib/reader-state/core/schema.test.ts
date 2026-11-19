import { describe, expect, it } from "vitest";
import { parseRecording, parseSnapshot, parseSnapshotChange, parseStreamMessage } from "./schema";

const snapshot = { v: 1, url: "/Genesis.1?lang=bi", nav: { nav: "go", panelKeys: ["k1"] }, slices: { "sefaria.settings": { v: 1, value: { fontSize: 62 } } } };

describe("parseSnapshot", () => {
  it("accepts a valid snapshot", () => {
    expect(parseSnapshot(snapshot)).toEqual(snapshot);
    expect(parseSnapshot({ v: 1, url: "/x", slices: {} })).toEqual({ v: 1, url: "/x", slices: {} });
  });

  it.each([
    ["not an object", "hello"],
    ["wrong version", { ...snapshot, v: 2 }],
    ["url not a string", { ...snapshot, url: 42 }],
    ["slice without v", { ...snapshot, slices: { a: { value: 1 } } }],
    ["negative slice version", { ...snapshot, slices: { a: { v: -1, value: 1 } } }],
    ["non-JSON value", { ...snapshot, slices: { a: { v: 1, value: new Map() } } }],
    ["NaN in nav", { ...snapshot, nav: { x: NaN } }],
  ])("rejects %s", (_name, input) => {
    expect(parseSnapshot(input)).toBeNull();
  });

  it("rejects prototype keys anywhere: slice ids, nav, deep values", () => {
    expect(parseSnapshot(JSON.parse('{"v":1,"url":"/x","slices":{"__proto__":{"v":1,"value":1}}}'))).toBeNull();
    expect(parseSnapshot({ ...snapshot, nav: JSON.parse('{"a":{"__proto__":{"polluted":1}}}') })).toBeNull();
    expect(parseSnapshot({ ...snapshot, slices: { a: { v: 1, value: { deep: [{ constructor: { prototype: 1 } }] } } } })).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("strips unknown top-level keys", () => {
    expect(parseSnapshot({ ...snapshot, extra: "x" })).not.toHaveProperty("extra");
  });
});

describe("parseSnapshotChange / parseStreamMessage", () => {
  it("accepts removals (null) and partial changes", () => {
    expect(parseSnapshotChange({ slices: { a: null } })).toEqual({ slices: { a: null } });
    expect(parseSnapshotChange({ url: "/y" })).toEqual({ url: "/y" });
    expect(parseSnapshotChange({ url: "/y" })).not.toHaveProperty("nav"); // absent nav stays absent: it did not change
  });

  it("parses keyframes and changes, and rejects bad seq/t/type", () => {
    expect(parseStreamMessage({ type: "keyframe", seq: 0, t: 0, snapshot })).toEqual({ type: "keyframe", seq: 0, t: 0, snapshot });
    expect(parseStreamMessage({ type: "change", seq: 1, t: 12.5, change: { url: "/z" } })).toEqual({ type: "change", seq: 1, t: 12.5, change: { url: "/z" } });
    expect(parseStreamMessage({ type: "change", seq: 1.5, t: 0, change: {} })).toBeNull();
    expect(parseStreamMessage({ type: "change", seq: 1, t: -1, change: {} })).toBeNull();
    expect(parseStreamMessage({ type: "other", seq: 1, t: 0 })).toBeNull();
    expect(parseStreamMessage({ type: "keyframe", seq: 0, t: 0, snapshot: { ...snapshot, url: null } })).toBeNull();
  });
});

describe("parseRecording", () => {
  const recording = {
    v: 1,
    startedAt: "2026-11-01T10:00:00.000Z",
    duration: 1500,
    client: "sefaria-reader@0.0.0",
    messages: [
      { type: "keyframe", seq: 0, t: 0, snapshot },
      { type: "change", seq: 1, t: 1500, change: { url: "/Genesis.2" } },
    ],
  };

  it("accepts a valid recording", () => {
    expect(parseRecording(recording)).toEqual(recording);
  });

  it("rejects a recording with one bad message, or polluted keys", () => {
    expect(parseRecording({ ...recording, messages: [...recording.messages, { type: "change", seq: 2 }] })).toBeNull();
    expect(parseRecording(JSON.parse(`{"v":1,"startedAt":"x","duration":0,"messages":[],"__proto__":{"polluted":1}}`))).toBeNull();
    expect(parseRecording({ ...recording, duration: "long" })).toBeNull();
  });
});
