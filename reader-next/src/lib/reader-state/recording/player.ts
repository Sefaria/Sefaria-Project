/**
 * The player (docs/READER_STATE_API.md, "Recording and replay"). Seeking to t takes the last keyframe at or before t and folds the changes up
 * to t into it; playing is seeking forward on a timer, one apply per message time. Everything is applied as `origin: "playback"` with
 * `persist: false`, so watching a recording never writes the viewer's cookies, preferences or history.
 */
import { fold } from "~/lib/reader-state/core/diff";
import type { ApplyContext, ApplyResult, ReaderSnapshot, ReaderStateApi, Recording } from "~/lib/reader-state/core/types";

const PLAYBACK: ApplyContext = { origin: "playback", persist: false };

/** Number of messages with `t <= time` (messages are sorted by t; loadRecording guarantees it). */
function countUpTo(rec: Recording, time: number): number {
  let lo = 0;
  let hi = rec.messages.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rec.messages[mid]!.t <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The state a recording shows at `count` messages in (at least the first keyframe: before it there is nothing else to show). */
function snapshotAtCount(rec: Recording, count: number): ReaderSnapshot {
  const msgs = rec.messages;
  const end = Math.max(1, Math.min(count, msgs.length));
  let k = end - 1;
  while (k > 0 && msgs[k]?.type !== "keyframe") k--;
  const first = msgs[k];
  if (!first || first.type !== "keyframe") throw new Error("snapshotAt: the recording does not start with a keyframe");
  let snap = first.snapshot;
  for (let i = k + 1; i < end; i++) {
    const m = msgs[i]!;
    snap = m.type === "keyframe" ? m.snapshot : fold(snap, m.change);
  }
  return snap;
}

/** The state the recording showed at `t` ms. Before the first message, the first keyframe. */
export function snapshotAt(rec: Recording, t: number): ReaderSnapshot {
  return snapshotAtCount(rec, countUpTo(rec, t));
}

/** Runs `cb` after `ms`; returns a cancel function. Injected in tests. */
export type Schedule = (cb: () => void, ms: number) => () => void;

export interface PlayerOptions {
  now?: () => number;
  schedule?: Schedule;
}

export interface Player {
  play(): void;
  pause(): void;
  /** Resolves with the warnings of the apply that showed `t` (or of a later one it was coalesced into). */
  seek(t: number): Promise<ApplyResult>;
  /** Playback speed; 1 is real time. Ignored unless finite and positive. */
  setRate(rate: number): void;
  time(): number;
  readonly playing: boolean;
  readonly rate: number;
  readonly duration: number;
  /** Fires on play, pause, seek, rate, reaching the end, and each apply while playing. */
  subscribe(cb: () => void): () => void;
  dispose(): void;
}

const defaultNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const defaultSchedule: Schedule = (cb, ms) => {
  const id = setTimeout(cb, ms);
  return () => clearTimeout(id);
};

export function createPlayer(rec: Recording, api: ReaderStateApi, opts: PlayerOptions = {}): Player {
  const now = opts.now ?? defaultNow;
  const schedule = opts.schedule ?? defaultSchedule;
  const last = rec.messages[rec.messages.length - 1];
  const duration = Math.max(0, rec.duration, last ? last.t : 0);
  const listeners = new Set<() => void>();

  let playing = false;
  let rate = 1;
  /** Position when not playing; when playing, the position at `anchorNow`. */
  let pos = 0;
  let anchorNow = 0;
  let cancelTimer: (() => void) | null = null;
  let disposed = false;
  /** Messages folded into the state last sent to applySnapshot (-1: nothing applied yet). */
  let appliedCount = -1;

  // One apply at a time: while one runs, later requests collapse into a single follow-up at the latest target. `explicit`: a seek asked
  // for it (kept through a pause); otherwise playback's own clock did (dropped on pause, or it would move the reader after the person took
  // it back).
  let inFlight = false;
  let inFlightCount = -1;
  let queued: { count: number; explicit: boolean; waiters: ((r: ApplyResult) => void)[] } | null = null;

  const notify = () => listeners.forEach((cb) => cb());
  const clamp = (t: number) => Math.min(duration, Math.max(0, Number.isFinite(t) ? t : 0));

  function time(): number {
    return playing ? clamp(pos + (now() - anchorNow) * rate) : pos;
  }

  function run(count: number): Promise<ApplyResult> {
    inFlight = true;
    inFlightCount = count;
    appliedCount = count;
    let p: Promise<ApplyResult>;
    try {
      p = Promise.resolve(api.applySnapshot(snapshotAtCount(rec, count), PLAYBACK));
    } catch (e) {
      p = Promise.reject(e);
    }
    return p
      .catch((): ApplyResult => ({ warnings: [] }))
      .then((result) => {
        inFlight = false;
        const next = queued;
        queued = null;
        if (next && !disposed) {
          void run(next.count).then((r) => next.waiters.forEach((w) => w(r)));
        } else if (next) {
          next.waiters.forEach((w) => w({ warnings: [] }));
        }
        return result;
      });
  }

  function applyCount(count: number, explicit: boolean): Promise<ApplyResult> {
    if (disposed) return Promise.resolve({ warnings: [] });
    if (!inFlight) return run(count);
    return new Promise((resolve) => {
      if (!queued) queued = { count, explicit, waiters: [] };
      queued.count = count;
      queued.explicit ||= explicit;
      appliedCount = count;
      queued.waiters.push(resolve);
    });
  }

  /** Drop a follow-up that playback's clock queued (not a seek's); the reader then shows what the in-flight apply shows. */
  function dropQueuedTick() {
    if (!queued || queued.explicit) return;
    const { waiters } = queued;
    queued = null;
    appliedCount = inFlightCount;
    waiters.forEach((w) => w({ warnings: [] }));
  }

  function clearTimer() {
    cancelTimer?.();
    cancelTimer = null;
  }

  function tick() {
    cancelTimer = null;
    if (!playing || disposed) return;
    const t = time();
    const count = countUpTo(rec, t);
    const changed = count !== appliedCount;
    if (changed) void applyCount(count, false);
    if (t >= duration) {
      pos = duration;
      playing = false;
      notify();
      return;
    }
    // Next stop: the first message after t, or the end.
    const nextT = rec.messages[count]?.t ?? duration;
    cancelTimer = schedule(tick, Math.max(0, (Math.min(nextT, duration) - t) / rate));
    if (changed) notify();
  }

  function reanchor() {
    pos = time();
    anchorNow = now();
  }

  return {
    play() {
      if (disposed || playing) return;
      if (pos >= duration) pos = 0;
      playing = true;
      anchorNow = now();
      notify();
      tick();
    },

    pause() {
      if (!playing) return;
      pos = time();
      playing = false;
      clearTimer();
      dropQueuedTick();
      notify();
    },

    seek(t) {
      const target = clamp(t);
      pos = target;
      anchorNow = now();
      clearTimer();
      const result = applyCount(countUpTo(rec, target), true);
      if (playing) {
        if (target >= duration) playing = false;
        else tick();
      }
      notify();
      return result;
    },

    setRate(r) {
      if (!Number.isFinite(r) || r <= 0 || r === rate) return;
      if (playing) {
        reanchor();
        clearTimer();
        rate = r;
        tick();
      } else {
        rate = r;
      }
      notify();
    },

    time,

    get playing() {
      return playing;
    },

    get rate() {
      return rate;
    },

    duration,

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    dispose() {
      disposed = true;
      playing = false;
      clearTimer();
      listeners.clear();
    },
  };
}
