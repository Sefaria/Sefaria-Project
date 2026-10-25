import { useSyncExternalStore } from "react";

/**
 * Reading with less around the text: the site header collapsed to a thin strip (remembered on this device), and full screen
 * (the browser's own, which also collapses the header while it lasts).
 */
const KEY = "sefaria-reader:header-collapsed";
let collapsed = false;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    collapsed = window.localStorage.getItem(KEY) === "1";
  } catch {
    collapsed = false;
  }
  document.addEventListener("fullscreenchange", emit);
}

export function setHeaderCollapsed(next: boolean) {
  collapsed = next;
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
  emit();
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

const subscribe = (cb: () => void) => {
  load();
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export const useHeaderCollapsed = () => useSyncExternalStore(subscribe, () => collapsed, () => false);
export const useFullscreen = () => useSyncExternalStore(subscribe, () => typeof document !== "undefined" && !!document.fullscreenElement, () => false);
