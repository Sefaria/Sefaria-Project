import { afterEach, describe, expect, it, vi } from "vitest";
import { createReaderStateApi } from "./api";
import { createStreamReader, createStreamWriter } from "./stream";
import { fakeHost, fakeSlice, flushPromises } from "./test-utils";
import type { ApplyContext, ApplyResult, ReaderSnapshot, ReaderStateApi, StreamMessage } from "./types";

const ctx: ApplyContext = { origin: "follow", persist: false };

function writerSetup() {
  const h = fakeHost("/Genesis.1", null);
  const scroll = fakeSlice("sefaria.scroll", { ref: "Genesis 1:1", offset: 0 });
  const focus = fakeSlice("sefaria.focus", "p1");
  const settings = fakeSlice("sefaria.settings", { fontSize: 62 }, { scope: "personal" });
  h.slices.register(scroll);
  h.slices.register(focus);
  h.slices.register(settings);
  const api = createReaderStateApi(h.host);
  let clock = 1000;
  const messages: StreamMessage[] = [];
  return {
    ...h,
    api,
    scroll,
    focus,
    settings,
    messages,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createStreamWriter", () => {
  it("starts with a keyframe at seq 0, t 0, then sends filtered changes with increasing seq and t", () => {
    const s = writerSetup();
    const writer = createStreamWriter(s.api, { filter: { scope: "moment" }, now: s.now });
    writer.start((m) => s.messages.push(m));
    expect(s.messages[0]).toMatchObject({ type: "keyframe", seq: 0, t: 0 });
    expect(Object.keys((s.messages[0] as { snapshot: ReaderSnapshot }).snapshot.slices)).toEqual(["sefaria.scroll", "sefaria.focus"]);
    s.focus.set("p2");
    s.tick();
    s.settings.set({ fontSize: 10 }); // personal: filtered out
    s.tick();
    expect(s.messages).toHaveLength(2);
    expect(s.messages[1]).toEqual({ type: "change", seq: 1, t: 0, change: { slices: { "sefaria.focus": { v: 1, value: "p2" } } } });
  });

  it("sends a keyframe instead of a change every N changes and every M ms", () => {
    vi.useFakeTimers();
    const s = writerSetup();
    const writer = createStreamWriter(s.api, { keyframeEveryChanges: 3, keyframeEveryMs: 5000, now: s.now });
    writer.start((m) => s.messages.push(m));
    for (const p of ["a", "b", "c"]) {
      s.focus.set(p);
      s.tick();
    }
    expect(s.messages.map((m) => m.type)).toEqual(["keyframe", "change", "change", "keyframe"]);
    expect(s.messages.map((m) => m.seq)).toEqual([0, 1, 2, 3]);
    s.advance(6000);
    s.focus.set("d");
    s.tick();
    expect(s.messages.at(-1)).toMatchObject({ type: "keyframe", seq: 4, t: 6000 });
    expect((s.messages.at(-1) as { snapshot: ReaderSnapshot }).snapshot.slices["sefaria.focus"]!.value).toBe("d");
  });

  it("keyframe() on demand, stop() ends the stream", () => {
    const s = writerSetup();
    const writer = createStreamWriter(s.api, { now: s.now });
    writer.start((m) => s.messages.push(m));
    writer.keyframe();
    expect(s.messages.map((m) => [m.type, m.seq])).toEqual([["keyframe", 0], ["keyframe", 1]]);
    writer.stop();
    s.focus.set("zz");
    s.tick();
    writer.keyframe();
    expect(s.messages).toHaveLength(2);
  });

  it("samples a slice: at most one change per interval, and always delivers the last value (trailing edge)", () => {
    vi.useFakeTimers();
    const s = writerSetup();
    const writer = createStreamWriter(s.api, { sampleMs: { "sefaria.scroll": 250 }, now: s.now });
    writer.start((m) => s.messages.push(m));
    // The keyframe just sent scroll: the first change waits out the interval.
    for (let i = 1; i <= 5; i++) {
      s.scroll.set({ ref: "Genesis 1:1", offset: i / 10 });
      s.tick();
      s.advance(40);
    }
    expect(s.messages).toHaveLength(1);
    s.advance(100); // 300 ms since the keyframe
    expect(s.messages).toHaveLength(2);
    expect(s.messages[1]).toMatchObject({ type: "change", change: { slices: { "sefaria.scroll": { v: 1, value: { offset: 0.5 } } } } });
    // Idle for longer than the interval: the next change goes out at once.
    s.advance(1000);
    s.scroll.set({ ref: "Genesis 1:2", offset: 0 });
    s.tick();
    expect(s.messages).toHaveLength(3);
    // ...and the stop is delivered after the interval.
    s.scroll.set({ ref: "Genesis 1:2", offset: 0.9 });
    s.tick();
    expect(s.messages).toHaveLength(3);
    s.advance(250);
    expect(s.messages.at(-1)).toMatchObject({ change: { slices: { "sefaria.scroll": { value: { offset: 0.9 } } } } });
    writer.stop();
  });

  it("a non-sampled change carries the held sampled value with it (never a stale scroll after a navigation)", () => {
    vi.useFakeTimers();
    const s = writerSetup();
    const writer = createStreamWriter(s.api, { sampleMs: { "sefaria.scroll": 250 }, now: s.now });
    writer.start((m) => s.messages.push(m));
    s.scroll.set({ ref: "Genesis 1:5", offset: 0.2 });
    s.tick();
    expect(s.messages).toHaveLength(1); // held
    s.go("/Exodus.1");
    s.tick();
    expect(s.messages[1]).toMatchObject({ change: { url: "/Exodus.1", slices: { "sefaria.scroll": { value: { ref: "Genesis 1:5" } } } } });
    s.advance(500);
    expect(s.messages).toHaveLength(2); // nothing left to release
    writer.stop();
  });

  it("never reports applied state", async () => {
    const s = writerSetup();
    const writer = createStreamWriter(s.api, { now: s.now });
    writer.start((m) => s.messages.push(m));
    await s.api.applySnapshot({ v: 1, url: "/Exodus.3", nav: null, slices: { "sefaria.focus": { v: 1, value: "p7" } } }, ctx);
    s.tickAll();
    expect(s.messages).toHaveLength(1);
  });
});

describe("createStreamReader", () => {
  const snap = (url: string, focus = "p1"): ReaderSnapshot => ({ v: 1, url, nav: null, slices: { "sefaria.focus": { v: 1, value: focus } } });

  function fakeApi() {
    const applied: ReaderSnapshot[] = [];
    let gate: Promise<void> | null = null;
    const api: ReaderStateApi = {
      getSnapshot: () => snap("/"),
      async applySnapshot(s) {
        applied.push(s);
        if (gate) await gate;
        return { warnings: [] };
      },
      subscribe: () => () => undefined,
      onLocalInput: () => () => undefined,
      applying: false,
    };
    return {
      api,
      applied,
      hold() {
        let release!: () => void;
        gate = new Promise<void>((r) => (release = r));
        return () => {
          gate = null;
          release();
        };
      },
    };
  }

  it("applies a keyframe, then each change folded onto it", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    expect(reader.current()).toBeUndefined();
    await reader.push({ type: "keyframe", seq: 0, t: 0, snapshot: snap("/Genesis.1") });
    await reader.push({ type: "change", seq: 1, t: 10, change: { url: "/Genesis.2" } });
    expect(reader.current()).toEqual(snap("/Genesis.2"));
    expect(f.applied.map((s) => s.url)).toEqual(["/Genesis.1", "/Genesis.2"]);
  });

  it("after a full apply, a change applies only the slices that changed", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    await reader.push({ type: "keyframe", seq: 0, t: 0, snapshot: { ...snap("/G"), slices: { a: { v: 1, value: 1 }, b: { v: 1, value: 1 } } } });
    await reader.push({ type: "change", seq: 1, t: 1, change: { slices: { b: { v: 1, value: 2 } } } });
    expect(f.applied[1]!.slices).toEqual({ b: { v: 1, value: 2 } });
    expect(reader.current()!.slices).toEqual({ a: { v: 1, value: 1 }, b: { v: 1, value: 2 } });
  });

  it("ignores messages that fail validation", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    const bad = JSON.parse('{"type":"keyframe","seq":0,"t":0,"snapshot":{"v":1,"url":"/x","slices":{"__proto__":{"v":1,"value":1}}}}');
    expect(await reader.push(bad)).toBeUndefined();
    expect(reader.current()).toBeUndefined();
    expect(f.applied).toEqual([]);
  });

  it("on a seq gap calls onGap and ignores changes until the next keyframe", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    const gap = vi.fn();
    reader.onGap(gap);
    await reader.push({ type: "keyframe", seq: 0, t: 0, snapshot: snap("/Genesis.1") });
    await reader.push({ type: "change", seq: 2, t: 10, change: { url: "/Genesis.3" } }); // seq 1 lost
    await reader.push({ type: "change", seq: 3, t: 20, change: { url: "/Genesis.4" } });
    expect(gap).toHaveBeenCalledTimes(1);
    expect(reader.current()!.url).toBe("/Genesis.1");
    await reader.push({ type: "keyframe", seq: 4, t: 30, snapshot: snap("/Genesis.4") });
    await reader.push({ type: "change", seq: 5, t: 40, change: { url: "/Genesis.5" } });
    expect(reader.current()!.url).toBe("/Genesis.5");
    expect(f.applied.map((s) => s.url)).toEqual(["/Genesis.1", "/Genesis.4", "/Genesis.5"]);
  });

  it("asks for a keyframe when it joins mid-stream, and drops duplicates without a gap", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    const gap = vi.fn();
    reader.onGap(gap);
    await reader.push({ type: "change", seq: 7, t: 0, change: { url: "/x" } });
    expect(gap).toHaveBeenCalledTimes(1);
    await reader.push({ type: "keyframe", seq: 8, t: 0, snapshot: snap("/a") });
    await reader.push({ type: "change", seq: 9, t: 0, change: { url: "/b" } });
    await reader.push({ type: "change", seq: 9, t: 0, change: { url: "/c" } });
    expect(gap).toHaveBeenCalledTimes(1);
    expect(reader.current()!.url).toBe("/b");
  });

  it("serializes and coalesces applies: messages during an apply lead to one apply of the latest state", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    const release = f.hold();
    const first = reader.push({ type: "keyframe", seq: 0, t: 0, snapshot: snap("/1") });
    await flushPromises();
    const second = reader.push({ type: "change", seq: 1, t: 0, change: { url: "/2" } });
    const third = reader.push({ type: "change", seq: 2, t: 0, change: { url: "/3" } });
    expect(f.applied.map((s) => s.url)).toEqual(["/1"]); // one at a time
    release();
    const results = await Promise.all([first, second, third]);
    expect(f.applied.map((s) => s.url)).toEqual(["/1", "/3"]); // "/2" never applied on its own
    expect(results.every((r: ApplyResult | undefined) => r && Array.isArray(r.warnings))).toBe(true);
  });

  it("pause keeps folding without applying; resume applies the folded state in full", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    await reader.push({ type: "keyframe", seq: 0, t: 0, snapshot: snap("/1", "p1") });
    reader.pause();
    expect(reader.paused).toBe(true);
    expect(await reader.push({ type: "change", seq: 1, t: 0, change: { url: "/2" } })).toBeUndefined();
    await reader.push({ type: "keyframe", seq: 2, t: 0, snapshot: snap("/3", "p2") });
    await reader.push({ type: "change", seq: 3, t: 0, change: { url: "/4" } });
    expect(f.applied).toHaveLength(1);
    expect(reader.current()).toEqual(snap("/4", "p2"));
    const result = await reader.resume();
    expect(result).toEqual({ warnings: [] });
    expect(reader.paused).toBe(false);
    expect(f.applied.at(-1)).toEqual(snap("/4", "p2")); // full, slices included
  });

  it("resume before any keyframe does nothing", async () => {
    const f = fakeApi();
    const reader = createStreamReader(f.api, ctx);
    reader.pause();
    expect(await reader.resume()).toBeUndefined();
    expect(f.applied).toEqual([]);
  });

  it("writer → reader end to end: the follower ends up where the leader is, and does not echo", async () => {
    const leader = writerSetup();
    const follower = fakeHost("/Genesis.1", null);
    const fFocus = fakeSlice("sefaria.focus", "p1");
    const fScroll = fakeSlice("sefaria.scroll", { ref: "Genesis 1:1", offset: 0 });
    follower.slices.register(fFocus);
    follower.slices.register(fScroll);
    const followerApi = createReaderStateApi(follower.host);
    const echoes = vi.fn();
    followerApi.subscribe(echoes);
    const reader = createStreamReader(followerApi, ctx);
    const pending: Promise<unknown>[] = [];
    createStreamWriter(leader.api, { filter: { scope: "moment" }, now: leader.now }).start((m) => pending.push(reader.push(m)));

    leader.go("/Exodus.4");
    leader.focus.set("p2");
    leader.scroll.set({ ref: "Exodus 4:2", offset: 0.4 });
    leader.tick();
    await Promise.all(pending);
    await flushPromises();
    follower.tickAll();
    expect(follower.host.getLocation().url).toBe("/Exodus.4");
    expect(fFocus.get()).toBe("p2");
    expect(fScroll.get()).toEqual({ ref: "Exodus 4:2", offset: 0.4 });
    expect(echoes).not.toHaveBeenCalled();
  });
});
