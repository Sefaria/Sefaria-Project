/**
 * A tiny listener set shared by the transports. One listener that throws must not stop the others (or the transport's own
 * bookkeeping), so errors are reported asynchronously instead of propagating.
 */
export interface Listeners<T> {
  add(cb: (value: T) => void): () => void;
  emit(value: T): void;
  clear(): void;
}

export function createListeners<T>(): Listeners<T> {
  const set = new Set<(value: T) => void>();
  return {
    add(cb) {
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
    emit(value) {
      // Copy: a listener may unsubscribe itself (or another) while we iterate.
      for (const cb of [...set]) {
        try {
          cb(value);
        } catch (err) {
          reportListenerError(err);
        }
      }
    },
    clear() {
      set.clear();
    },
  };
}

function reportListenerError(err: unknown): void {
  const g = globalThis as { reportError?: (e: unknown) => void };
  if (typeof g.reportError === "function") g.reportError(err);
  else console.error(err);
}

/** The size of a frame in UTF-8 bytes (what a relay measures), not in UTF-16 code units. */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
