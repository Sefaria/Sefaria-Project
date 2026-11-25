/**
 * Streams (docs/READER_STATE_API.md, "Streams"): one shape for recording and following — a keyframe, then changes, a keyframe again now and
 * then. The writer turns the API's reports into messages; the reader folds messages into a state and applies it.
 */
import type {
  ApplyContext,
  ApplyResult,
  ReaderSnapshot,
  ReaderStateApi,
  SliceId,
  SliceValue,
  SnapshotChange,
  StreamMessage,
  StreamReader,
  StreamWriter,
  StreamWriterOptions,
} from "./types";
import { WARNING } from "./types";
import { diff, fold, isEmptyChange } from "./diff";
import { parseStreamMessage } from "./schema";

const DEFAULT_KEYFRAME_MS = 10_000;
const DEFAULT_KEYFRAME_CHANGES = 50;

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

// ── Writer ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Keyframes come on a schedule checked when a change arrives (a change that falls due is sent as a keyframe instead): an idle stream sends
 * nothing, so a long pause in a recording costs no bytes, and a follower joining an idle leader gets the room's last keyframe.
 *
 * Sampling (`sampleMs`) holds back a sampled slice's change until its interval has passed and then sends the latest value (trailing edge):
 * a scroll is reported a few times a second and always where it stopped. A change to anything else carries the held values with it, so a
 * held scroll can never arrive after the navigation that followed it.
 */
export function createStreamWriter(api: ReaderStateApi, opts: StreamWriterOptions = {}): StreamWriter {
  const now = opts.now ?? defaultNow;
  const keyframeEveryMs = opts.keyframeEveryMs ?? DEFAULT_KEYFRAME_MS;
  const keyframeEveryChanges = opts.keyframeEveryChanges ?? DEFAULT_KEYFRAME_CHANGES;
  const sampleMs = opts.sampleMs ?? {};
  const sampled = (id: SliceId) => Object.prototype.hasOwnProperty.call(sampleMs, id) && (sampleMs[id] ?? 0) > 0;

  let emit: ((msg: StreamMessage) => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let seq = 0;
  let startedAt = 0;
  let lastKeyframeAt = 0;
  let changesSinceKeyframe = 0;
  const lastSentAt = new Map<SliceId, number>();
  const held = new Map<SliceId, SliceValue>();
  const timers = new Map<SliceId, ReturnType<typeof setTimeout>>();

  const clearHeld = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    held.clear();
  };

  const send = (msg: StreamMessage) => {
    try {
      emit?.(msg);
    } catch (err) {
      console.error("[reader-state] stream emit failed", err);
    }
  };

  const sendKeyframe = () => {
    if (!emit) return;
    const at = now();
    const snapshot = api.getSnapshot(opts.filter);
    // The keyframe holds every slice's current value: nothing held back is still owed.
    clearHeld();
    for (const id of Object.keys(snapshot.slices)) if (sampled(id)) lastSentAt.set(id, at);
    lastKeyframeAt = at;
    changesSinceKeyframe = 0;
    send({ type: "keyframe", seq: seq++, t: Math.max(0, at - startedAt), snapshot });
  };

  const sendChange = (change: SnapshotChange) => {
    if (!emit || isEmptyChange(change)) return;
    const at = now();
    if (at - lastKeyframeAt >= keyframeEveryMs || changesSinceKeyframe + 1 >= keyframeEveryChanges) {
      sendKeyframe();
      return;
    }
    if (change.slices) for (const id of Object.keys(change.slices)) if (sampled(id)) lastSentAt.set(id, at);
    changesSinceKeyframe++;
    send({ type: "change", seq: seq++, t: Math.max(0, at - startedAt), change });
  };

  /** Sends the held value of `id` (its interval is over). */
  const releaseHeld = (id: SliceId) => {
    timers.delete(id);
    const value = held.get(id);
    if (!value) return;
    held.delete(id);
    sendChange({ slices: { [id]: value } });
  };

  const onChange = (change: SnapshotChange) => {
    if (!emit) return;
    const at = now();
    const out: SnapshotChange = {};
    if (change.url !== undefined) out.url = change.url;
    if (Object.prototype.hasOwnProperty.call(change, "nav")) out.nav = change.nav;
    const slices: Record<SliceId, SliceValue | null> = {};
    let immediate = out.url !== undefined || "nav" in out;

    for (const id of Object.keys(change.slices ?? {})) {
      const value = change.slices![id]!;
      if (value === null || !sampled(id)) {
        // A removal is never sampled (nothing to coalesce), and drops any held value of that slice.
        if (value === null && timers.has(id)) {
          clearTimeout(timers.get(id)!);
          timers.delete(id);
          held.delete(id);
        }
        slices[id] = value;
        immediate = true;
        continue;
      }
      const interval = sampleMs[id]!;
      const since = at - (lastSentAt.get(id) ?? -Infinity);
      if (since >= interval && !timers.has(id)) {
        slices[id] = value;
      } else {
        held.set(id, value);
        if (!timers.has(id)) timers.set(id, setTimeout(() => releaseHeld(id), Math.max(0, interval - since)));
      }
    }

    if (immediate) {
      // Carry the held values along: they are older than this change and must not arrive after it.
      for (const [id, value] of held) if (!(id in slices)) slices[id] = value;
      clearHeld();
    }
    if (Object.keys(slices).length) out.slices = slices;
    sendChange(out);
  };

  return {
    start(next) {
      if (emit) this.stop();
      emit = next;
      seq = 0;
      startedAt = now();
      lastSentAt.clear();
      sendKeyframe();
      unsubscribe = api.subscribe(onChange, opts.filter);
    },
    keyframe: sendKeyframe,
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      clearHeld();
      emit = null;
    },
  };
}

// ── Reader ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Applies are serialized (an apply navigates and awaits the text; two at once would race) and coalesced: messages that arrive while one
 * runs are folded, and only the state after the last of them is applied when it finishes. After the first full apply, a change applies only
 * the slices that differ from what was last applied, so an unrelated change does not re-scroll every column; keyframes and `resume` apply
 * everything.
 */
export function createStreamReader(api: ReaderStateApi, ctx: ApplyContext): StreamReader {
  let current: ReaderSnapshot | undefined;
  let lastApplied: ReaderSnapshot | undefined;
  let applyFull = true;
  let expectedSeq: number | undefined;
  let waitingForKeyframe = true;
  let gapReported = false;
  let paused = false;
  const gapListeners = new Set<() => void>();

  let running: Promise<ApplyResult | undefined> | null = null;
  let queued: { promise: Promise<ApplyResult | undefined>; resolve: (r: ApplyResult | undefined) => void } | null = null;

  const reportGap = () => {
    if (gapReported) return;
    gapReported = true;
    for (const cb of [...gapListeners]) {
      try {
        cb();
      } catch (err) {
        console.error("[reader-state] gap listener failed", err);
      }
    }
  };

  const target = (): ReaderSnapshot | undefined => {
    if (!current) return undefined;
    if (applyFull || !lastApplied) return current;
    const changed = diff(lastApplied, current).slices ?? {};
    const slices: Record<SliceId, SliceValue> = {};
    for (const id of Object.keys(changed)) {
      const value = changed[id];
      if (value) slices[id] = value;
    }
    return { ...current, slices };
  };

  const run = (): Promise<ApplyResult | undefined> => {
    const p = (async () => {
      const snapshot = paused ? undefined : target();
      if (!snapshot) return undefined;
      const appliedState = current!;
      applyFull = false;
      try {
        const result = await api.applySnapshot(snapshot, ctx);
        lastApplied = appliedState;
        return result;
      } catch (err) {
        // applySnapshot never throws by contract; if a host breaks that, the next apply should be a full one.
        applyFull = true;
        const result: ApplyResult = { warnings: [{ code: WARNING.SLICE_FAILED, detail: err instanceof Error ? err.message : String(err) }] };
        return result;
      }
    })();
    running = p;
    // Registered before the caller's await, so the next queued apply starts before the caller resumes.
    void p.then(() => {
      running = null;
      if (queued) {
        const q = queued;
        queued = null;
        void run().then(q.resolve);
      }
    });
    return p;
  };

  const requestApply = (): Promise<ApplyResult | undefined> => {
    if (!running) return run();
    if (!queued) {
      let resolve!: (r: ApplyResult | undefined) => void;
      const promise = new Promise<ApplyResult | undefined>((r) => (resolve = r));
      queued = { promise, resolve };
    }
    return queued.promise;
  };

  return {
    async push(raw) {
      const msg = parseStreamMessage(raw);
      if (!msg) return undefined;
      if (msg.type === "keyframe") {
        current = msg.snapshot;
        expectedSeq = msg.seq + 1;
        waitingForKeyframe = false;
        gapReported = false;
        applyFull = true;
        return paused ? undefined : requestApply();
      }
      if (waitingForKeyframe || !current || expectedSeq === undefined) {
        reportGap(); // joined mid-stream, or after a gap: only a keyframe helps
        return undefined;
      }
      if (msg.seq < expectedSeq) return undefined; // a duplicate or a late copy: already folded
      if (msg.seq > expectedSeq) {
        waitingForKeyframe = true;
        reportGap();
        return undefined;
      }
      current = fold(current, msg.change);
      expectedSeq++;
      return paused ? undefined : requestApply();
    },
    current: () => current,
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      applyFull = true; // the person moved while paused: put back everything, not just what changed
      return current ? requestApply() : Promise.resolve(undefined);
    },
    get paused() {
      return paused;
    },
    onGap(cb) {
      gapListeners.add(cb);
      return () => {
        gapListeners.delete(cb);
      };
    },
  };
}
