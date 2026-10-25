import { useSyncExternalStore } from "react";

/** An ordered list of strings kept in localStorage, shared by every component that reads it (and other tabs). */
export function localList(key: string, initial: readonly string[]) {
  let items: readonly string[] = initial;
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) items = (JSON.parse(raw) as unknown[]).filter((x): x is string => typeof x === "string");
    } catch {
      // unreadable: keep the initial list
    }
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;
      loaded = false;
      load();
      emit();
    });
  }
  function set(next: readonly string[]) {
    load();
    items = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // storage unavailable: lasts for this page only
    }
    emit();
  }
  const subscribe = (cb: () => void) => {
    load();
    listeners.add(cb);
    return () => void listeners.delete(cb);
  };
  return {
    get: () => (load(), items),
    has: (x: string) => (load(), items.includes(x)),
    add: (x: string) => set(items.includes(x) ? items : [...items, x]),
    remove: (x: string) => set(items.filter((i) => i !== x)),
    toggle: (x: string) => (items.includes(x) ? set(items.filter((i) => i !== x)) : set([...items, x])),
    use: () => useSyncExternalStore(subscribe, () => items, () => initial),
  };
}
