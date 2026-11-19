// The whole-sidebar collapse, remembered per browser as live does (REFERENCE_SPEC §1.2: "Collapsing hides the
// sidebar and persists across reloads"). Live keeps it in ReadMe's own storage; the portal uses localStorage so it
// stays cookie-free. Every access is guarded: storage can be missing or throw (private mode, blocked site data).
import { useCallback, useSyncExternalStore } from 'react';

export const SIDEBAR_COLLAPSED_KEY = 'dp-sidebar-collapsed';

const listeners = new Set<() => void>();

export function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remembered value, or the in-memory one when storage refuses the write. */
let memory: boolean | null = null;

function snapshot(): boolean {
  return memory ?? readCollapsed();
}

export function writeCollapsed(collapsed: boolean): void {
  memory = collapsed;
  try {
    if (collapsed) window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');
    else window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
    memory = null;
  } catch {
    // Keep the in-memory value for this page view.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_COLLAPSED_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The collapse state shared by every sidebar on the page, and its setter. Expanded on the server. */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, snapshot, () => false);
  const set = useCallback((value: boolean) => writeCollapsed(value), []);
  return [collapsed, set];
}

/** Test hook: forget the in-memory fallback. */
export function resetCollapsedForTests(): void {
  memory = null;
}
