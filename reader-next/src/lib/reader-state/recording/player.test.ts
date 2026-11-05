import { describe, expect, it } from "vitest";
import { createPlayer, snapshotAt, type Schedule } from "./player";
import { createFakeApi, makeRecording, snap } from "./test-helpers";

const S = (n: number) => ({ "sefaria.settings": { v: 1, value: { fontSize: n } } });

/** keyframe /a @0, url /b @100, setting @200, keyframe /c @300, setting @400; duration 500. */
const rec = makeRecording(
  [
    { type: "keyframe", t: 0, snapshot: snap("/a") },
    { type: "change", t: 100, change: { url: "/b" } },
    { type: "change", t: 200, change: { slices: S(18) } },
    { type: "keyframe", t: 300, snapshot: snap("/c", S(18)) },
    { type: "change", t: 400, change: { slices: S(24) } },
  ],
  500,
);

describe("snapshotAt", () => {
  it("returns the first keyframe at and before the start", () => {
    expect(snapshotAt(rec, -5)).toEqual(snap("/a"));
    expect(snapshotAt(rec, 0)).toEqual(snap("/a"));
    expect(snapshotAt(rec, 99)).toEqual(snap("/a"));
  });
  it("folds changes up to t onto the last keyframe", () => {
    expect(snapshotAt(rec, 100).url).toBe("/b");
    expect(snapshotAt(rec, 250)).toMatchObject({ url: "/b", slices: S(18) });
  });
  it("starts from a later keyframe once past it", () => {
    expect(snapshotAt(rec, 300)).toEqual(snap("/c", S(18)));
    expect(snapshotAt(rec, 450)).toMatchObject({ url: "/c", slices: S(24) });
    expect(snapshotAt(rec, 10_000)).toMatchObject({ url: "/c", slices: S(24) });
  });
});

/** A clock and timer queue the test advances by hand. */
function fakeTime() {
  let clock = 0;
  let timers: { at: number; cb: () => void; id: number }[] = [];
  let nextId = 0;
  const schedule: Schedule = (cb, ms) => {
    const id = nextId++;
    timers.push({ at: clock + ms, cb, id });
    return () => {
      timers = timers.filter((t) => t.id !== id);
    };
  };
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));
  async function advance(ms: number) {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > end) break;
      timers.shift();
      clock = due.at;
      due.cb();
      await flush();
    }
    clock = end;
    await flush();
  }
  return { now: () => clock, schedule, advance, flush };
}

describe("createPlayer", () => {
  it("seeks with playback context and returns the apply's result", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    const player = createPlayer(rec, api, ft);
    expect(player.duration).toBe(500);
    const result = await player.seek(250);
    expect(result).toEqual({ warnings: [] });
    expect(player.time()).toBe(250);
    expect(api.applied.at(-1)!.ctx).toEqual({ origin: "playback", persist: false });
    expect(api.applied.at(-1)!.snapshot).toMatchObject({ url: "/b", slices: S(18) });
    await player.seek(-10);
    expect(player.time()).toBe(0);
    await player.seek(9_999);
    expect(player.time()).toBe(500);
  });

  it("plays, applying at each message time, and pauses at the end", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    const player = createPlayer(rec, api, ft);
    player.play();
    await ft.flush();
    expect(player.playing).toBe(true);
    expect(api.applied.map((a) => a.snapshot.url)).toEqual(["/a"]);

    await ft.advance(150);
    expect(api.applied.map((a) => a.snapshot.url)).toEqual(["/a", "/b"]);
    expect(player.time()).toBe(150);

    await ft.advance(1_000);
    expect(api.applied.length).toBe(5);
    expect(api.applied.at(-1)!.snapshot).toMatchObject({ url: "/c", slices: S(24) });
    expect(player.playing).toBe(false);
    expect(player.time()).toBe(500);

    // Play again from the end restarts.
    player.play();
    await ft.flush();
    expect(api.applied.at(-1)!.snapshot.url).toBe("/a");
    player.dispose();
  });

  it("pause stops applying and keeps the position", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    const player = createPlayer(rec, api, ft);
    player.play();
    await ft.advance(120);
    player.pause();
    const count = api.applied.length;
    await ft.advance(1_000);
    expect(api.applied.length).toBe(count);
    expect(player.time()).toBe(120);
    player.play();
    await ft.advance(90);
    expect(api.applied.at(-1)!.snapshot.slices).toEqual(S(18));
  });

  it("seek during play keeps playing from the new position", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    const player = createPlayer(rec, api, ft);
    player.play();
    await ft.advance(50);
    await player.seek(350);
    expect(player.playing).toBe(true);
    expect(api.applied.at(-1)!.snapshot.url).toBe("/c");
    await ft.advance(60);
    expect(player.time()).toBe(410);
    expect(api.applied.at(-1)!.snapshot.slices).toEqual(S(24));
  });

  it("setRate speeds playback up", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    const player = createPlayer(rec, api, ft);
    player.setRate(2);
    player.play();
    await ft.advance(100);
    expect(player.time()).toBe(200);
    expect(api.applied.at(-1)!.snapshot.slices).toEqual(S(18));
    player.setRate(0);
    expect(player.rate).toBe(2);
  });

  it("coalesces: while an apply runs, only the latest due state is applied next", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    let release!: () => void;
    api.gate = new Promise<void>((r) => (release = r));
    const player = createPlayer(rec, api, ft);
    player.play();
    await ft.advance(450);
    // The first apply (/a) is still running; the ticks at 100..400 collapsed into one pending apply.
    expect(api.applied.length).toBe(1);
    api.gate = null;
    release();
    await ft.flush();
    expect(api.applied.length).toBe(2);
    expect(api.applied[1]!.snapshot).toMatchObject({ url: "/c", slices: S(24) });
  });

  it("pause drops the follow-up playback queued, so nothing is applied after the person took the reader back", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    let release!: () => void;
    api.gate = new Promise<void>((r) => (release = r));
    const player = createPlayer(rec, api, ft);
    player.play();
    await ft.advance(150); // /a in flight; the tick at 100 queued /b
    player.pause();
    api.gate = null;
    release();
    await ft.flush();
    expect(api.applied.map((a) => a.snapshot.url)).toEqual(["/a"]);
    // Resuming applies what is due from where it paused.
    player.play();
    await ft.flush();
    expect(api.applied.at(-1)!.snapshot.url).toBe("/b");
  });

  it("pause keeps a follow-up a seek asked for", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    let release!: () => void;
    api.gate = new Promise<void>((r) => (release = r));
    const player = createPlayer(rec, api, ft);
    player.play();
    await ft.flush();
    const seeking = player.seek(350);
    player.pause();
    api.gate = null;
    release();
    await seeking;
    expect(api.applied.at(-1)!.snapshot.url).toBe("/c");
  });

  it("notifies subscribers and stops after dispose", async () => {
    const api = createFakeApi();
    const ft = fakeTime();
    const player = createPlayer(rec, api, ft);
    let calls = 0;
    player.subscribe(() => calls++);
    player.play();
    player.pause();
    expect(calls).toBeGreaterThanOrEqual(2);
    player.dispose();
    player.play();
    await ft.advance(1_000);
    expect(player.playing).toBe(false);
  });
});
