/** Fakes shared by the recording tests: an API whose state the test drives, and recordings built by hand. */
import type {
  ApplyContext,
  ApplyResult,
  ReaderSnapshot,
  ReaderStateApi,
  Recording,
  SnapshotChange,
  StreamMessage,
} from "~/lib/reader-state/core/types";

export function snap(url: string, slices: ReaderSnapshot["slices"] = {}): ReaderSnapshot {
  return { v: 1, url, nav: null, slices };
}

export interface FakeApi extends ReaderStateApi {
  /** Make a local change: updates the state and tells subscribers, as the real API does for the person's own changes. */
  change(change: SnapshotChange): void;
  applied: { snapshot: ReaderSnapshot; ctx: ApplyContext }[];
  /** When set, applySnapshot waits on this before resolving (to test coalescing). */
  gate: Promise<void> | null;
}

export function createFakeApi(initial: ReaderSnapshot = snap("/Genesis.1")): FakeApi {
  let state = initial;
  const subs = new Set<(c: SnapshotChange, s: ReaderSnapshot) => void>();
  const api: FakeApi = {
    applied: [],
    gate: null,
    getSnapshot: () => state,
    async applySnapshot(snapshot, ctx): Promise<ApplyResult> {
      api.applied.push({ snapshot, ctx });
      if (api.gate) await api.gate;
      state = snapshot;
      return { warnings: [] };
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    onLocalInput: () => () => {},
    applying: false,
    change(change) {
      const slices = { ...state.slices };
      for (const [id, v] of Object.entries(change.slices ?? {})) {
        if (v === null) delete slices[id];
        else slices[id] = v;
      }
      state = { ...state, ...(change.url !== undefined ? { url: change.url } : {}), slices };
      subs.forEach((cb) => cb(change, state));
    },
  };
  return api;
}

/** A recording from messages without seq: seq is filled in, duration defaults to the last t. */
export function makeRecording(
  msgs: (Omit<Extract<StreamMessage, { type: "keyframe" }>, "seq"> | Omit<Extract<StreamMessage, { type: "change" }>, "seq">)[],
  duration?: number,
): Recording {
  const messages = msgs.map((m, seq) => ({ ...m, seq }) as StreamMessage);
  return {
    v: 1,
    startedAt: new Date(2026, 10, 1, 14, 32, 5).toISOString(),
    duration: duration ?? messages.at(-1)?.t ?? 0,
    messages,
  };
}
