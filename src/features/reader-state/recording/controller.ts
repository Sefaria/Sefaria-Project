/**
 * The recording feature's state, outside React: one controller per ReaderStateApi, shared by the floating dock (RecordingDock) and the
 * entry in the display settings menu (useRecordSessionEntry), which live in different parts of the tree. Loaded on first use through
 * ./handle.ts (a dynamic import), which also owns the file picker.
 *
 * Playback is applied to the person's real reader, not to a second router (docs/READER_STATE_API.md, "Recording and replay"): entering
 * it saves a snapshot of where they are (scope all: location, settings, scroll) and leaving it applies that snapshot back. The player
 * applies every moment as `origin: "playback"`, `persist: false`, and the API navigates with replace, so the person's history, cookies
 * and preferences are untouched by watching.
 *
 * The clock is not state here: the recorder and player only notify on start/stop and play/pause/seek/rate/end, so the dock reads
 * `recorder.elapsed()` and `player.time()` on animation frames.
 */
import { createPlayer, createRecorder, downloadRecording, loadRecording, type Player, type Recorder } from "~/lib/reader-state/recording";
import type { ApplyContext, ReaderSnapshot, ReaderStateApi, Recording } from "~/lib/reader-state/core/types";

const PLAYBACK: ApplyContext = { origin: "playback", persist: false };

export type RecordingView =
  | { mode: "idle" }
  | { mode: "recording" }
  | { mode: "stopped"; recording: Recording }
  | {
      mode: "playback";
      recording: Recording;
      playing: boolean;
      rate: number;
      /** The person scrolled, clicked or typed in the reader, which paused playback: offer Resume. */
      interrupted: boolean;
      /** Exit was asked for; the saved place is being restored. */
      exiting: boolean;
    };

export interface RecordingState {
  view: RecordingView;
  /** A message for the person (a file that would not load, a download the browser refused); cleared by the next action. */
  error: string | null;
  /** A file is being read. */
  loading: boolean;
}

export interface RecordingController {
  getState(): RecordingState;
  subscribe(cb: () => void): () => void;
  /** The running recorder (for its clock), or null. */
  recorder(): Recorder | null;
  /** The player during playback (for its clock and to seek), or null. */
  player(): Player | null;

  start(): void;
  stop(): void;
  download(): void;
  discard(): void;
  replay(): Promise<void>;
  load(file: File | Blob): Promise<void>;
  resume(): void;
  exit(): Promise<void>;
  dismissError(): void;
  /**
   * The dock calls this from its capture-phase input handlers. Input anywhere reaches api.onLocalInput first (the host listens on window),
   * so without it every click on Pause or the scrubber would count as the person taking the reader back.
   */
  markDockInput(): void;
  dispose(): void;
}

export interface RecordingControllerOptions {
  /** Defaults: the real recorder and player; tests inject fakes or clocks. */
  createRecorder?: typeof createRecorder;
  createPlayer?: typeof createPlayer;
  download?: (rec: Recording) => boolean;
  /** Runs `cb` after the current event has finished dispatching. Default setTimeout 0. */
  defer?: (cb: () => void) => void;
}

const IDLE: RecordingState = { view: { mode: "idle" }, error: null, loading: false };

export function createRecordingController(api: ReaderStateApi, opts: RecordingControllerOptions = {}): RecordingController {
  const makeRecorder = opts.createRecorder ?? createRecorder;
  const makePlayer = opts.createPlayer ?? createPlayer;
  const save = opts.download ?? downloadRecording;
  const defer = opts.defer ?? ((cb: () => void) => void setTimeout(cb, 0));

  const listeners = new Set<() => void>();
  let state: RecordingState = IDLE;
  let recorder: Recorder | null = null;
  let player: Player | null = null;
  let unsubPlayer: (() => void) | null = null;
  let unsubInput: (() => void) | null = null;
  /** Where the person was before playback; applied back on exit. Kept across loading a second recording during playback. */
  let saved: ReaderSnapshot | null = null;
  /**
   * The input event being decided now (between api.onLocalInput and the deferred check), which markDockInput marks as the dock's. A mark
   * made with no such event (the dock clicked outside playback: Replay, Load recording…) has nothing to mark, so it can never be mistaken
   * for the person's next input in the reader.
   */
  let pendingInput: { dock: boolean } | null = null;

  const set = (next: Partial<RecordingState>) => {
    state = { ...state, ...next };
    listeners.forEach((cb) => cb());
  };
  const patchPlayback = (patch: Partial<Extract<RecordingView, { mode: "playback" }>>) => {
    if (state.view.mode !== "playback") return;
    set({ view: { ...state.view, ...patch } });
  };

  function teardownPlayer() {
    unsubPlayer?.();
    unsubPlayer = null;
    unsubInput?.();
    unsubInput = null;
    player?.dispose();
    player = null;
  }

  async function enterPlayback(recording: Recording) {
    // Taken before anything is applied, and only the first time: a second recording loaded mid-replay returns to the same place.
    if (!saved) saved = api.getSnapshot({ scope: "all" });
    teardownPlayer();
    const p = makePlayer(recording, api);
    player = p;
    unsubPlayer = p.subscribe(() => {
      if (player !== p) return;
      patchPlayback({ playing: p.playing, rate: p.rate });
    });
    pendingInput = null;
    unsubInput = api.onLocalInput(() => {
      const input = { dock: false };
      pendingInput = input;
      // Decided after the event has reached the dock's handlers, which say whether it was theirs.
      defer(() => {
        if (pendingInput === input) pendingInput = null;
        if (input.dock || player !== p || !p.playing) return;
        p.pause();
        patchPlayback({ interrupted: true });
      });
    });
    set({ view: { mode: "playback", recording, playing: false, rate: p.rate, interrupted: false, exiting: false }, error: null });
    await p.seek(0);
    if (player === p) p.play();
  }

  return {
    getState: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    recorder: () => recorder,
    player: () => player,

    start() {
      if (state.view.mode !== "idle" && state.view.mode !== "stopped") return;
      recorder = makeRecorder(api, { client: "sefaria-reader" });
      recorder.start();
      set({ view: { mode: "recording" }, error: null });
    },

    stop() {
      if (state.view.mode !== "recording" || !recorder) return;
      const recording = recorder.stop();
      recorder = null;
      set({ view: { mode: "stopped", recording } });
    },

    download() {
      const v = state.view;
      if (v.mode !== "stopped" && v.mode !== "playback") return;
      const ok = save(v.recording);
      set({ error: ok ? null : "This browser could not save the file." });
    },

    discard() {
      if (state.view.mode !== "stopped") return;
      set({ view: { mode: "idle" }, error: null });
    },

    replay() {
      if (state.view.mode !== "stopped") return Promise.resolve();
      return enterPlayback(state.view.recording);
    },

    async load(file) {
      if (state.view.mode === "recording" || state.loading) return;
      set({ loading: true, error: null });
      const result = await loadRecording(file);
      if ("error" in result) {
        set({ loading: false, error: result.error });
        return;
      }
      set({ loading: false });
      await enterPlayback(result.recording);
    },

    resume() {
      if (state.view.mode !== "playback" || !player) return;
      patchPlayback({ interrupted: false });
      player.play();
    },

    async exit() {
      const v = state.view;
      if (v.mode !== "playback" || v.exiting) return;
      const back = saved;
      teardownPlayer();
      patchPlayback({ exiting: true, playing: false });
      try {
        if (back) await api.applySnapshot(back, PLAYBACK);
      } finally {
        saved = null;
        // Back to the recording's actions (Download, Replay, Discard), so it can be watched again or saved without loading it again.
        set({ view: { mode: "stopped", recording: v.recording } });
      }
    },

    dismissError() {
      set({ error: null });
    },

    markDockInput() {
      if (pendingInput) pendingInput.dock = true;
    },

    dispose() {
      teardownPlayer();
      if (recorder?.recording) recorder.stop();
      recorder = null;
      listeners.clear();
    },
  };
}

/** One controller per API (the provider makes one API per router), so the dock and the menu entry share it. */
const perApi = new WeakMap<ReaderStateApi, RecordingController>();

export function recordingControllerFor(api: ReaderStateApi): RecordingController {
  let c = perApi.get(api);
  if (!c) {
    c = createRecordingController(api);
    perApi.set(api, c);
  }
  return c;
}
