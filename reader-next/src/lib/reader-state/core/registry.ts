/**
 * The slice registry: where the parts of the reader that the URL does not hold (settings, scroll, focus) offer their state to the API.
 * Slices come and go with the components that own them, so the API listens to `onChange` and re-wires its subscriptions.
 */
import type { SliceId, SliceRegistry, StateSlice } from "./types";

export function createSliceRegistry(): SliceRegistry {
  // A Map, not an object: slice ids are strings from code, but snapshots name slices too, and a Map has no prototype keys to reach.
  const slices = new Map<SliceId, StateSlice>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const cb of [...listeners]) {
      try {
        cb();
      } catch (err) {
        console.error("[reader-state] registry listener failed", err);
      }
    }
  };

  return {
    /** A second slice with the same id replaces the first (a remount registers before the old unmount unregisters). */
    register(slice) {
      slices.set(slice.id, slice);
      notify();
      return () => {
        // Only remove it if it is still the registered one: a replacement must survive the old owner's cleanup.
        if (slices.get(slice.id) === slice) {
          slices.delete(slice.id);
          notify();
        }
      };
    },
    get: (id) => slices.get(id),
    list: () => [...slices.values()],
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
