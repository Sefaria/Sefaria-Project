/**
 * The recorder (docs/READER_STATE_API.md, "Recording and replay"): a stream writer whose messages go to an array instead of a transport.
 * Every slice is recorded (settings included, so the replay looks as it looked); scroll is sampled at 250 ms, which is smooth enough to
 * watch and keeps a long recording small.
 */
import { createStreamWriter } from "~/lib/reader-state/core/stream";
import type { ReaderStateApi, Recording, StreamMessage, StreamWriter } from "~/lib/reader-state/core/types";

export interface RecorderOptions {
  /** Injected clock (ms); default performance.now. Shared with the stream writer so `t` and `elapsed()` agree. */
  now?: () => number;
  /** Stored in the recording ("sefaria-reader@<version>"). */
  client?: string;
}

export interface Recorder {
  start(): void;
  /** Ends with a keyframe, so the recording's last moment is exact rather than folded from sampled changes. */
  stop(): Recording;
  readonly recording: boolean;
  /** ms since start (0 when not recording). */
  elapsed(): number;
  /** Fires on start and stop. */
  subscribe(cb: () => void): () => void;
}

const defaultNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function createRecorder(api: ReaderStateApi, opts: RecorderOptions = {}): Recorder {
  const now = opts.now ?? defaultNow;
  const listeners = new Set<() => void>();
  let writer: StreamWriter | null = null;
  let messages: StreamMessage[] = [];
  let startedAt = "";
  let startNow = 0;
  /** Set once the final keyframe is out: a sampled change the writer flushes on stop would land after it and undo its exactness. */
  let closed = false;

  const notify = () => listeners.forEach((cb) => cb());

  return {
    start() {
      if (writer) return;
      messages = [];
      closed = false;
      startedAt = new Date().toISOString();
      startNow = now();
      const w = createStreamWriter(api, {
        filter: { scope: "all" },
        sampleMs: { "sefaria.scroll": 250 },
        keyframeEveryMs: 10_000,
        keyframeEveryChanges: 50,
        now,
      });
      writer = w;
      w.start((msg: StreamMessage) => {
        if (closed) return;
        messages.push(msg);
      });
      notify();
    },

    stop() {
      if (!writer) throw new Error("createRecorder: stop() without start()");
      const w = writer;
      const end = now() - startNow;
      w.keyframe();
      closed = true;
      w.stop();
      writer = null;
      const last = messages[messages.length - 1];
      const recording: Recording = {
        v: 1,
        startedAt,
        duration: Math.max(0, end, last ? last.t : 0),
        ...(opts.client ? { client: opts.client } : {}),
        messages,
      };
      messages = [];
      notify();
      return recording;
    },

    get recording() {
      return writer !== null;
    },

    elapsed() {
      return writer ? Math.max(0, now() - startNow) : 0;
    },

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
