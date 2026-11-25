/**
 * What closing the only text panel does, when something other than the reader owns the answer. By default the panel's close button
 * goes back to the library (SHL-048); the shell can hand it another action and label for a while: a text opened beside the social
 * page closes back to that page (src/features/surfaces/SurfaceBeside.tsx, SHL-079). The reader never imports surface code
 * (architecture rule surface-boundary): the shell plugs in here, the panel reads it.
 */
import { useSyncExternalStore } from "react";

export interface SolePanelClose {
  label: { en: string; he: string };
  close: () => void;
}

let current: SolePanelClose | null = null;
const subs = new Set<() => void>();

/** Sets the override; returns how to remove it (only if it is still the one set). */
export function setSolePanelClose(next: SolePanelClose): () => void {
  current = next;
  subs.forEach((cb) => cb());
  return () => {
    if (current !== next) return;
    current = null;
    subs.forEach((cb) => cb());
  };
}

const subscribe = (cb: () => void) => (subs.add(cb), () => void subs.delete(cb));

/** The override in force, or null (the panel's own behaviour). */
export const useSolePanelClose = (): SolePanelClose | null => useSyncExternalStore(subscribe, () => current, () => null);
