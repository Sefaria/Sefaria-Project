import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecorder } from "./recorder";
import { createFakeApi, snap } from "./test-helpers";

describe("createRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setting = (n: number) => ({ slices: { "sefaria.settings": { v: 1, value: { fontSize: n } } } });

  it("starts with a keyframe and ends with an exact keyframe of the final state", async () => {
    const api = createFakeApi(snap("/Genesis.1"));
    const rec = createRecorder(api, { now: () => Date.now(), client: "sefaria-reader@test" });
    const onChange = vi.fn();
    rec.subscribe(onChange);

    rec.start();
    expect(rec.recording).toBe(true);
    vi.advanceTimersByTime(100);
    api.change({ url: "/Genesis.2" });
    await vi.advanceTimersByTimeAsync(100);
    api.change(setting(20));
    await vi.advanceTimersByTimeAsync(300);
    expect(rec.elapsed()).toBe(500);

    const out = rec.stop();
    expect(rec.recording).toBe(false);
    expect(rec.elapsed()).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);

    expect(out.v).toBe(1);
    expect(out.client).toBe("sefaria-reader@test");
    expect(Number.isNaN(Date.parse(out.startedAt))).toBe(false);
    expect(out.duration).toBe(500);

    const first = out.messages[0]!;
    const lastMsg = out.messages.at(-1)!;
    expect(first.type).toBe("keyframe");
    expect(first.type === "keyframe" && first.snapshot.url).toBe("/Genesis.1");
    expect(lastMsg.type).toBe("keyframe");
    expect(lastMsg.type === "keyframe" && lastMsg.snapshot).toEqual(api.getSnapshot());
    expect(lastMsg.t).toBeLessThanOrEqual(out.duration);
    out.messages.forEach((m, i) => expect(m.seq).toBe(first.seq + i));
  });

  it("keyframes at least every 50 changes", async () => {
    const api = createFakeApi();
    const rec = createRecorder(api, { now: () => Date.now() });
    rec.start();
    for (let i = 0; i < 120; i++) {
      await vi.advanceTimersByTimeAsync(10);
      api.change(setting(i));
    }
    const out = rec.stop();
    let run = 0;
    let longest = 0;
    for (const m of out.messages) {
      run = m.type === "keyframe" ? 0 : run + 1;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeLessThanOrEqual(50);
    expect(out.messages.filter((m) => m.type === "keyframe").length).toBeGreaterThanOrEqual(3);
  });

  it("keyframes at least every 10 s", async () => {
    const api = createFakeApi();
    const rec = createRecorder(api, { now: () => Date.now() });
    rec.start();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(6_000);
      api.change(setting(i));
    }
    const out = rec.stop();
    const keyframeTimes = out.messages.filter((m) => m.type === "keyframe").map((m) => m.t);
    for (let i = 1; i < keyframeTimes.length; i++) expect(keyframeTimes[i]! - keyframeTimes[i - 1]!).toBeLessThanOrEqual(12_000);
    expect(keyframeTimes.length).toBeGreaterThanOrEqual(3);
  });

  it("ignores a second start and refuses stop without start", () => {
    const api = createFakeApi();
    const rec = createRecorder(api, { now: () => Date.now() });
    expect(() => rec.stop()).toThrow();
    rec.start();
    rec.start();
    const out = rec.stop();
    expect(out.messages[0]?.type).toBe("keyframe");
  });
});
