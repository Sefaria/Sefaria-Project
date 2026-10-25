import type { PanelId } from "~/lib/workspace/types";

/** A verse the reader picked in one panel; every other panel marks what corresponds to it. `null` clears the marks. */
export interface LinkedVerse {
  from: PanelId;
  ref: string;
  book: string;
}

const listeners = new Set<(v: LinkedVerse | null) => void>();

export function announceLinkedVerse(v: LinkedVerse | null) {
  listeners.forEach((l) => l(v));
}

export function onLinkedVerse(listener: (v: LinkedVerse | null) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
