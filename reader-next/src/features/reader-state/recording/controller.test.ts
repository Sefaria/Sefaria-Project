import { describe, expect, it, vi } from "vitest";
import { createPlayer, serializeRecording } from "~/lib/reader-state/recording";
import { createFakeApi, makeRecording, snap } from "~/lib/reader-state/recording/test-helpers";
import { createRecordingController } from "./controller";

const S = (n: number) => ({ "sefaria.settings": { v: 1, value: { fontSize: n } } });
const rec = makeRecording(
  [
    { type: "keyframe", t: 0, snapshot: snap("/Genesis.1", S(18)) },
    { type: "change", t: 1_000, change: { url: "/Genesis.2" } },
    { type: "keyframe", t: 2_000, snapshot: snap("/Genesis.3", S(24)) },
  ],
  3_000,
);

/** A fake API whose local input the test fires, and a controller whose player never advances on its own (no timers). */
function setup() {
  const api = createFakeApi(snap("/Exodus.4", S(20)));
  const inputs = new Set<() => void>();
  api.onLocalInput = (cb) => (inputs.add(cb), () => inputs.delete(cb));
  const deferred: (() => void)[] = [];
  const download = vi.fn(() => true);
  const c = createRecordingController(api, {
    createPlayer: (r, a) => createPlayer(r, a, { schedule: () => () => {} }),
    download,
    defer: (cb) => deferred.push(cb),
  });
  /** The person's input reaching the reader; `onDock` as when it lands on the dock (its capture handler runs before the deferred check). */
  const localInput = (onDock = false) => {
    inputs.forEach((cb) => cb());
    if (onDock) c.markDockInput();
    deferred.splice(0).forEach((cb) => cb());
  };
  return { api, c, download, localInput, inputs };
}

describe("recording controller: recording", () => {
  it("records, stops into a finished recording, and discards back to idle", () => {
    const { api, c } = setup();
    c.start();
    expect(c.getState().view.mode).toBe("recording");
    expect(c.recorder()?.recording).toBe(true);
    api.change({ url: "/Exodus.5" });
    c.stop();
    const v = c.getState().view;
    expect(v.mode).toBe("stopped");
    if (v.mode !== "stopped") throw new Error();
    expect(v.recording.messages[0]).toMatchObject({ type: "keyframe", snapshot: { url: "/Exodus.4" } });
    expect(v.recording.client).toBe("sefaria-reader");
    expect(c.recorder()).toBeNull();
    c.discard();
    expect(c.getState().view.mode).toBe("idle");
  });

  it("downloads the recording, and says so when the browser cannot", () => {
    const { c, download } = setup();
    c.start();
    c.stop();
    c.download();
    expect(download).toHaveBeenCalledTimes(1);
    expect(c.getState().error).toBeNull();
    download.mockReturnValueOnce(false);
    c.download();
    expect(c.getState().error).toMatch(/could not save/);
  });
});

describe("recording controller: playback", () => {
  it("saves where the person is, applies the start as playback without persisting, and plays", async () => {
    const { api, c } = setup();
    await c.load(new Blob([serializeRecording(rec)]));
    const v = c.getState().view;
    expect(v).toMatchObject({ mode: "playback", playing: true, interrupted: false });
    expect(api.applied[0]).toEqual({ snapshot: snap("/Genesis.1", S(18)), ctx: { origin: "playback", persist: false } });
  });

  it("seeks through the player, to the state at that time", async () => {
    const { api, c } = setup();
    await c.load(new Blob([serializeRecording(rec)]));
    await c.player()!.seek(2_500);
    expect(api.applied.at(-1)?.snapshot.url).toBe("/Genesis.3");
  });

  it("pauses when the person uses the reader, offers Resume, and ignores input on the dock", async () => {
    const { c, localInput } = setup();
    await c.load(new Blob([serializeRecording(rec)]));
    localInput(true);
    expect(c.getState().view).toMatchObject({ playing: true, interrupted: false });
    localInput();
    expect(c.getState().view).toMatchObject({ playing: false, interrupted: true });
    c.resume();
    expect(c.getState().view).toMatchObject({ playing: true, interrupted: false });
  });

  it("a dock click before playback (Replay) does not make the first input in the reader count as the dock's", async () => {
    const { c, localInput } = setup();
    c.start();
    c.stop();
    c.markDockInput(); // the pointerdown on Replay, outside playback
    await c.replay();
    localInput();
    expect(c.getState().view).toMatchObject({ playing: false, interrupted: true });
  });

  it("on exit, disposes the player and applies back the saved place (location, settings, scroll)", async () => {
    const { api, c, inputs } = setup();
    await c.load(new Blob([serializeRecording(rec)]));
    await c.exit();
    expect(api.applied.at(-1)).toEqual({ snapshot: snap("/Exodus.4", S(20)), ctx: { origin: "playback", persist: false } });
    expect(c.player()).toBeNull();
    expect(inputs.size).toBe(0);
    expect(c.getState().view).toMatchObject({ mode: "stopped", recording: rec });
  });

  it("a second recording loaded mid-replay still returns to the place before the first", async () => {
    const { api, c } = setup();
    await c.load(new Blob([serializeRecording(rec)]));
    await c.load(new Blob([serializeRecording(rec)]));
    await c.exit();
    expect(api.applied.at(-1)?.snapshot.url).toBe("/Exodus.4");
  });

  it("replays the recording just made", async () => {
    const { api, c } = setup();
    c.start();
    c.stop();
    await c.replay();
    expect(c.getState().view.mode).toBe("playback");
    expect(api.applied[0]?.snapshot.url).toBe("/Exodus.4");
  });
});

describe("recording controller: loading", () => {
  it("shows why a file is not a recording, and stays idle", async () => {
    const { c } = setup();
    await c.load(new Blob(["not json"]));
    expect(c.getState()).toMatchObject({ view: { mode: "idle" }, error: expect.stringMatching(/not JSON/), loading: false });
    c.dismissError();
    expect(c.getState().error).toBeNull();
  });

  it("does not load while recording", async () => {
    const { c } = setup();
    c.start();
    await c.load(new Blob([serializeRecording(rec)]));
    expect(c.getState().view.mode).toBe("recording");
  });

});
