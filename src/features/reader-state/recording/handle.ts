/**
 * The recording feature as every page sees it before anyone uses it: a small handle per ReaderStateApi that loads the controller (and
 * with it the recorder, player and file code) with a dynamic import on first use — "Record session", a file chosen in the picker. Until
 * then its state is idle and nothing of the feature is downloaded.
 *
 * The handle also owns the file picker: browsers open a picker only during a click, so "Load recording…" must reach the hidden input
 * synchronously, never after an import.
 */
import type { ReaderStateApi } from "~/lib/reader-state/core/types";
import type { RecordingController, RecordingState } from "./controller";

export interface RecordingHandle {
  /** The controller once it has loaded, else null. */
  controller(): RecordingController | null;
  /** Load the controller (once) and resolve with it. */
  load(): Promise<RecordingController>;
  /** The controller's state; idle until it has loaded. */
  getState(): RecordingState;
  /** Fires when the controller has loaded, and on each change of its state after. */
  subscribe(cb: () => void): () => void;
  /** Open the file picker the dock registered (call from a click handler). */
  pickFile(): void;
  setFilePicker(open: (() => void) | null): void;
}

export const IDLE_RECORDING_STATE: RecordingState = { view: { mode: "idle" }, error: null, loading: false };

type ControllerModule = Pick<typeof import("./controller"), "recordingControllerFor">;
const loadControllerModule = (): Promise<ControllerModule> => import("./controller");

export function createRecordingHandle(api: ReaderStateApi, loadModule: () => Promise<ControllerModule> = loadControllerModule): RecordingHandle {
  let controller: RecordingController | null = null;
  let loading: Promise<RecordingController> | null = null;
  let filePicker: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const cb of [...listeners]) cb();
  };

  return {
    controller: () => controller,
    load() {
      if (!loading) {
        loading = loadModule().then((m) => {
          const c = m.recordingControllerFor(api);
          controller = c;
          c.subscribe(notify);
          notify();
          return c;
        });
        // A failed import (offline) may be tried again on the next click.
        loading.catch(() => {
          loading = null;
        });
      }
      return loading;
    },
    getState: () => controller?.getState() ?? IDLE_RECORDING_STATE,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    pickFile() {
      filePicker?.();
    },
    setFilePicker(open) {
      filePicker = open;
    },
  };
}

/** One handle per API (the provider makes one API per router), so the dock and the menu entry share it. */
const perApi = new WeakMap<ReaderStateApi, RecordingHandle>();

export function recordingHandleFor(api: ReaderStateApi): RecordingHandle {
  let h = perApi.get(api);
  if (!h) {
    h = createRecordingHandle(api);
    perApi.set(api, h);
  }
  return h;
}
